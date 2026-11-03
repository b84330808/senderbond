import { z } from "zod";
import { db, logEvent, newId } from "./db";
import { chatJson } from "./ai";
import { priceBond, reviewCampaign, type BondLine, type Review } from "./review";
import { AUDIENCES, WINDOW_HOURS, simulatedCounts, type Audience } from "./simulate";
import {
  authorizeOrder,
  captureAuthorization,
  createBondOrder,
  createPayoutBatch,
  getPayoutBatch,
  usd,
  voidAuthorization,
} from "./paypal";

// --- Settlement rules (deterministic) ------------------------------------
export const FREE_RATE = 0.001; // below 0.1%: full refund
export const FULL_RATE = 0.003; // above 0.3% (Gmail / Yahoo bulk-sender limit): full forfeit
export const REPORTER_POOL_SHARE = 0.5; // half of a forfeit goes to people who reported
export const REPORTER_CAP_CENTS = 50; // max reward per reporter per campaign

export const SANDBOX_REWARD_EMAIL = "sb-xqirg53690244@personal.example.com";

const PERSONAS = [
  { id: "p_maya", name: "Maya Chen", address: "maya@inbox.demo" },
  { id: "p_diego", name: "Diego Ramos", address: "diego@inbox.demo" },
  { id: "p_priya", name: "Priya Nair", address: "priya@inbox.demo" },
];

export type CampaignRow = {
  id: string;
  sender_name: string;
  sender_email: string;
  subject: string;
  body: string;
  list_size: number;
  audience: Audience;
  status: "reviewed" | "bond_pending" | "bonded" | "sending" | "settled" | "failed";
  review_json: string | null;
  review_provider: string | null;
  risk_tier: string | null;
  bond_cents: number | null;
  bond_breakdown_json: string | null;
  paypal_order_id: string | null;
  authorization_id: string | null;
  sent_at: number | null;
  sim_hours: number;
  settled_at: number | null;
  settlement_json: string | null;
  created_at: number;
};

export type Settlement = {
  complaint_rate: number;
  complaints: number;
  recipients: number;
  capture_fraction: number;
  captured_cents: number;
  released_cents: number;
  paypal_action: "void" | "capture";
  paypal_capture_id: string | null;
  reporter_count: number;
  reward_per_reporter_cents: number;
  live_rewards_cents: number;
  simulated_rewards_cents: number;
  esp_fund_cents: number;
  payout_batch_id: string | null;
  flagged_reporters: { persona_id: string; reason: string }[];
  letter: string;
  letter_provider: string;
};

export function ensurePersonas() {
  const insert = db().prepare("INSERT OR IGNORE INTO personas (id, name, address, paypal_email) VALUES (?, ?, ?, ?)");
  for (const p of PERSONAS) insert.run(p.id, p.name, p.address, SANDBOX_REWARD_EMAIL);
}

export function listPersonas() {
  ensurePersonas();
  return db().prepare("SELECT * FROM personas ORDER BY name").all() as {
    id: string;
    name: string;
    address: string;
    paypal_email: string | null;
  }[];
}

export function getCampaign(id: string): CampaignRow {
  const row = db().prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as CampaignRow | undefined;
  if (!row) throw new Error(`Campaign ${id} not found`);
  return row;
}

function setStatus(id: string, status: CampaignRow["status"], fields: Record<string, unknown> = {}) {
  const keys = Object.keys(fields);
  const sets = ["status = ?", ...keys.map((k) => `${k} = ?`)].join(", ");
  db()
    .prepare(`UPDATE campaigns SET ${sets} WHERE id = ?`)
    .run(status, ...(keys.map((k) => fields[k]) as (string | number | null)[]), id);
}

// --- Stats ----------------------------------------------------------------

export function campaignStats(c: CampaignRow) {
  const live = db()
    .prepare(
      `SELECT d.*, p.name AS persona_name FROM deliveries d JOIN personas p ON p.id = d.persona_id WHERE d.campaign_id = ?`,
    )
    .all(c.id) as {
    persona_id: string;
    persona_name: string;
    reaction: string;
    counts_as_complaint: number;
    reply_text: string | null;
    reply_json: string | null;
  }[];
  const simulatedRecipients = Math.max(0, c.list_size - live.length);
  const sim = c.sent_at ? simulatedCounts(c.audience, simulatedRecipients, c.sim_hours) : null;
  const liveComplaints = live.filter((d) => d.counts_as_complaint).length;
  const liveUnsubs = live.filter((d) => d.reaction === "unsubscribed").length;
  const liveOpens = live.filter((d) => d.reaction !== "none").length;
  const complaints = (sim?.complaints ?? 0) + liveComplaints;
  const recipients = c.list_size;
  return {
    recipients,
    simulated_recipients: simulatedRecipients,
    live_recipients: live.length,
    opens: (sim?.opens ?? 0) + liveOpens,
    unsubscribes: (sim?.unsubscribes ?? 0) + liveUnsubs,
    complaints,
    simulated_complaints: sim?.complaints ?? 0,
    live_complaints: liveComplaints,
    complaint_rate: c.sent_at ? complaints / recipients : 0,
    hours_elapsed: c.sim_hours,
    window_hours: WINDOW_HOURS,
    live,
  };
}

export function captureFraction(rate: number) {
  if (rate < FREE_RATE) return 0;
  if (rate >= FULL_RATE) return 1;
  return (rate - FREE_RATE) / (FULL_RATE - FREE_RATE);
}

export function serialize(c: CampaignRow) {
  const stats = campaignStats(c);
  return {
    ...c,
    review: c.review_json ? (JSON.parse(c.review_json) as Review) : null,
    bond_lines: c.bond_breakdown_json ? (JSON.parse(c.bond_breakdown_json) as BondLine[]) : [],
    settlement: c.settlement_json ? (JSON.parse(c.settlement_json) as Settlement) : null,
    audience_label: AUDIENCES[c.audience].label,
    stats: { ...stats, projected_fraction: captureFraction(stats.complaint_rate) },
  };
}

// --- Flow: create + AI review ---------------------------------------------

export const NewCampaignSchema = z.object({
  sender_name: z.string().min(1).max(80),
  sender_email: z.string().min(3).max(120),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(6000),
  list_size: z.number().int().min(100).max(50000),
  audience: z.enum(["opted_in", "scraped"]),
});

export async function createAndReview(input: z.infer<typeof NewCampaignSchema>) {
  const id = newId("cmp");
  const now = Date.now();
  const { data: review, provider, model, cached } = await reviewCampaign(input);
  const bond = priceBond(review, input.list_size);
  db()
    .prepare(
      `INSERT INTO campaigns (id, sender_name, sender_email, subject, body, list_size, audience, status, review_json,
        review_provider, risk_tier, bond_cents, bond_breakdown_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'reviewed', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.sender_name,
      input.sender_email,
      input.subject,
      input.body,
      input.list_size,
      input.audience,
      JSON.stringify(review),
      `${provider} · ${model}${cached ? " (cached)" : ""}`,
      review.risk_tier,
      bond.cents,
      JSON.stringify(bond.lines),
      now,
    );
  logEvent(id, "review", `AI review: ${review.risk_tier} risk (${review.risk_score}/100), bond $${usd(bond.cents)}`, {
    provider,
    model,
    cached,
  });
  return getCampaign(id);
}

// --- Flow: bond via PayPal --------------------------------------------------

export async function startBond(id: string) {
  const c = getCampaign(id);
  if (!["reviewed", "bond_pending"].includes(c.status) || !c.bond_cents) throw new Error(`Campaign is ${c.status}, cannot post a bond`);
  const order = await createBondOrder({
    campaignId: c.id,
    amountCents: c.bond_cents,
    description: `SenderBond deliverability bond for "${c.subject}"`,
  });
  setStatus(id, "bond_pending", { paypal_order_id: order.id });
  logEvent(id, "paypal", `Bond order ${order.id} created (intent AUTHORIZE, $${usd(c.bond_cents)})`);
  return order.id;
}

export async function confirmBond(id: string, orderId: string) {
  const c = getCampaign(id);
  if (c.paypal_order_id !== orderId) throw new Error("Order does not belong to this campaign");
  if (c.status === "bonded" && c.authorization_id) return c;
  const auth = await authorizeOrder(orderId);
  setStatus(id, "bonded", { authorization_id: auth.authorizationId });
  logEvent(id, "paypal", `Bond held: authorization ${auth.authorizationId} (${auth.authorizationStatus}). Nothing charged yet.`, auth);
  return getCampaign(id);
}

// --- Flow: send + time ------------------------------------------------------

export function sendCampaign(id: string) {
  const c = getCampaign(id);
  if (c.status !== "bonded") throw new Error("Post the bond before sending");
  ensurePersonas();
  const insert = db().prepare("INSERT OR IGNORE INTO deliveries (id, campaign_id, persona_id) VALUES (?, ?, ?)");
  for (const p of listPersonas()) insert.run(newId("dlv"), id, p.id);
  setStatus(id, "sending", { sent_at: Date.now(), sim_hours: 0 });
  logEvent(id, "send", `Sent to ${c.list_size.toLocaleString("en-US")} recipients. ${WINDOW_HOURS}h complaint window opened.`);
  return getCampaign(id);
}

export async function advanceTime(id: string, hours: number) {
  const c = getCampaign(id);
  if (c.status !== "sending") throw new Error("Campaign is not in its complaint window");
  const next = Math.min(WINDOW_HOURS, c.sim_hours + hours);
  db().prepare("UPDATE campaigns SET sim_hours = ? WHERE id = ?").run(next, id);
  logEvent(id, "time", `Demo clock moved to ${next}h of ${WINDOW_HOURS}h`);
  if (next >= WINDOW_HOURS) await settleCampaign(id);
  return getCampaign(id);
}

// --- Recipient reactions ----------------------------------------------------

const ReplySchema = z.object({
  intent: z.enum(["interested", "question", "not_interested", "angry_stop", "auto_reply"]),
  summary: z.string(),
});

const REPLY_SYSTEM = `You classify a recipient's reply to a marketing email for an email service provider.
intent must be one of:
- "interested": positive, wants more / wants to buy
- "question": asks something neutral
- "not_interested": politely declines
- "angry_stop": angry, says it is spam, demands to stop, or threatens to report
- "auto_reply": out-of-office or automatic response
Reply with JSON only: { "intent": ..., "summary": one short sentence }`;

export async function react(deliveryId: string, action: "open" | "report" | "unsubscribe" | "reply", text?: string) {
  const d = db().prepare("SELECT * FROM deliveries WHERE id = ?").get(deliveryId) as
    | { id: string; campaign_id: string; persona_id: string; reaction: string }
    | undefined;
  if (!d) throw new Error("Delivery not found");
  const c = getCampaign(d.campaign_id);
  if (c.status !== "sending") throw new Error("The complaint window for this campaign is closed");
  const persona = listPersonas().find((p) => p.id === d.persona_id)!;
  const now = Date.now();

  if (action === "open") {
    if (d.reaction === "none") db().prepare("UPDATE deliveries SET reaction = 'opened', reacted_at = ? WHERE id = ?").run(now, d.id);
    return;
  }
  if (action === "report") {
    db().prepare("UPDATE deliveries SET reaction = 'reported', counts_as_complaint = 1, reacted_at = ? WHERE id = ?").run(now, d.id);
    logEvent(c.id, "complaint", `${persona.name} reported "${c.subject}" as spam`);
    return;
  }
  if (action === "unsubscribe") {
    db().prepare("UPDATE deliveries SET reaction = 'unsubscribed', reacted_at = ? WHERE id = ?").run(now, d.id);
    logEvent(c.id, "unsubscribe", `${persona.name} unsubscribed`);
    return;
  }
  const replyText = (text ?? "").trim().slice(0, 2000);
  if (!replyText) throw new Error("Reply text is empty");
  const { data, provider } = await chatJson({
    task: "reply-classify-v1",
    system: REPLY_SYSTEM,
    user: `Original subject: ${c.subject}\n\nReply:\n${replyText}`,
    schema: ReplySchema,
  });
  const complaint = data.intent === "angry_stop" ? 1 : 0;
  db()
    .prepare("UPDATE deliveries SET reaction = 'replied', reply_text = ?, reply_json = ?, counts_as_complaint = ?, reacted_at = ? WHERE id = ?")
    .run(replyText, JSON.stringify({ ...data, provider }), complaint, now, d.id);
  logEvent(
    c.id,
    complaint ? "complaint" : "reply",
    `${persona.name} replied (AI: ${data.intent})${complaint ? " — counted as a complaint" : ""}`,
    data,
  );
}

// --- Settlement -------------------------------------------------------------

const ReporterCheckSchema = z.object({
  flag: z.boolean(),
  reason: z.string(),
});

async function checkReporter(personaId: string): Promise<{ flag: boolean; reason: string }> {
  const history = db()
    .prepare(
      `SELECT c.subject, c.risk_tier, d.counts_as_complaint AS reported FROM deliveries d
       JOIN campaigns c ON c.id = d.campaign_id WHERE d.persona_id = ? AND c.sent_at IS NOT NULL ORDER BY c.sent_at`,
    )
    .all(personaId) as { subject: string; risk_tier: string; reported: number }[];
  const reports = history.filter((h) => h.reported).length;
  // Not enough history, or a normal reporting pattern: no need to ask the model.
  if (history.length < 3 || reports / history.length < 0.6) {
    return { flag: false, reason: "Normal reporting pattern" };
  }
  const { data } = await chatJson({
    task: "reporter-check-v1",
    system: `You protect a spam-reporter reward program from abuse. Someone may report every email just to collect rewards.
Given one recipient's history (campaign subject, its pre-send risk tier, and whether they reported it), decide whether to withhold their reward.
Flag only when the pattern looks like reward farming (e.g. reporting low-risk, clearly wanted mail as spam). Reply with JSON only: { "flag": boolean, "reason": one sentence }`,
    user: JSON.stringify(history),
    schema: ReporterCheckSchema,
  });
  return data;
}

const LetterSchema = z.object({ letter: z.string().min(1) });

export async function settleCampaign(id: string) {
  const c = getCampaign(id);
  if (c.status === "settled") return c;
  if (c.status !== "sending" || !c.authorization_id || !c.bond_cents) throw new Error("Campaign is not ready to settle");
  const stats = campaignStats(c);
  const fraction = captureFraction(stats.complaint_rate);
  const capturedCents = Math.round(c.bond_cents * fraction);

  let paypalCaptureId: string | null = null;
  if (capturedCents === 0) {
    await voidAuthorization(c.authorization_id);
    logEvent(id, "paypal", `Authorization ${c.authorization_id} voided: full $${usd(c.bond_cents)} released to sender`);
  } else {
    const capture = await captureAuthorization(c.authorization_id, capturedCents);
    paypalCaptureId = capture.id;
    logEvent(
      id,
      "paypal",
      `Captured $${usd(capturedCents)} of $${usd(c.bond_cents)} (capture ${capture.id}); the rest was released`,
    );
  }

  // Reporter rewards: half of the forfeit, split per reporter, capped.
  const liveReporters = stats.live.filter((d) => d.counts_as_complaint);
  const reporterCount = stats.simulated_complaints + liveReporters.length;
  const pool = Math.floor(capturedCents * REPORTER_POOL_SHARE);
  const perReporter = reporterCount > 0 ? Math.min(REPORTER_CAP_CENTS, Math.floor(pool / reporterCount)) : 0;

  const flagged: { persona_id: string; reason: string }[] = [];
  const payable: { persona_id: string; email: string }[] = [];
  if (perReporter > 0) {
    const personas = listPersonas();
    for (const r of liveReporters) {
      const check = await checkReporter(r.persona_id);
      const persona = personas.find((p) => p.id === r.persona_id)!;
      if (check.flag) flagged.push({ persona_id: r.persona_id, reason: check.reason });
      else if (persona.paypal_email) payable.push({ persona_id: r.persona_id, email: persona.paypal_email });
    }
  }

  let batchId: string | null = null;
  if (payable.length > 0) {
    const senderBatchId = `sb-${id}`;
    const batch = await createPayoutBatch(
      senderBatchId,
      payable.map((p) => ({
        senderItemId: `${id}-${p.persona_id}`,
        email: p.email,
        amountCents: perReporter,
        note: `Reporter reward for "${c.subject}"`,
      })),
    );
    batchId = batch.batch_header.payout_batch_id;
    const insert = db().prepare(
      "INSERT INTO payouts (id, campaign_id, persona_id, paypal_email, amount_cents, batch_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const p of payable) insert.run(newId("po"), id, p.persona_id, p.email, perReporter, batchId, batch.batch_header.batch_status, Date.now());
    logEvent(id, "payout", `Payouts batch ${batchId}: $${usd(perReporter)} to ${payable.length} reporter(s)`);
  }

  const liveRewards = perReporter * payable.length;
  const simulatedRewards = perReporter * stats.simulated_complaints;
  const settlement: Omit<Settlement, "letter" | "letter_provider"> = {
    complaint_rate: stats.complaint_rate,
    complaints: stats.complaints,
    recipients: stats.recipients,
    capture_fraction: fraction,
    captured_cents: capturedCents,
    released_cents: c.bond_cents - capturedCents,
    paypal_action: capturedCents === 0 ? "void" : "capture",
    paypal_capture_id: paypalCaptureId,
    reporter_count: reporterCount,
    reward_per_reporter_cents: perReporter,
    live_rewards_cents: liveRewards,
    simulated_rewards_cents: simulatedRewards,
    esp_fund_cents: capturedCents - liveRewards - simulatedRewards,
    payout_batch_id: batchId,
    flagged_reporters: flagged,
  };

  let letter = "";
  let letterProvider = "";
  try {
    const review = c.review_json ? (JSON.parse(c.review_json) as Review) : null;
    const res = await chatJson({
      task: "settlement-letter-v1",
      system: `You write the short settlement notice an email service provider sends to a sender after a campaign's bond is settled.
Be factual and constructive, 3-5 sentences, plain text, no greeting line. Explain the result using the numbers given,
compare the pre-send prediction with what actually happened, and give one concrete tip for next time.
Reply with JSON only: { "letter": "..." }`,
      user: JSON.stringify({
        subject: c.subject,
        pre_send_review: review && {
          risk_tier: review.risk_tier,
          predicted_complaint_rate_pct: review.predicted_complaint_rate_pct,
          top_signals: review.signals.slice(0, 3).map((s) => s.label),
        },
        actual_complaint_rate_pct: +(stats.complaint_rate * 100).toFixed(3),
        rules: "under 0.1% full refund, 0.1-0.3% partial forfeit, over 0.3% full forfeit",
        bond_usd: usd(c.bond_cents),
        forfeited_usd: usd(capturedCents),
        refunded_usd: usd(c.bond_cents - capturedCents),
      }),
      schema: LetterSchema,
    });
    letter = res.data.letter;
    letterProvider = `${res.provider} · ${res.model}`;
  } catch (err) {
    letter = `Complaint rate ${(stats.complaint_rate * 100).toFixed(2)}%. $${usd(capturedCents)} forfeited, $${usd(c.bond_cents - capturedCents)} returned.`;
    letterProvider = `fallback (${(err as Error).message.slice(0, 80)})`;
  }

  setStatus(id, "settled", {
    settled_at: Date.now(),
    settlement_json: JSON.stringify({ ...settlement, letter, letter_provider: letterProvider }),
  });
  logEvent(id, "settle", `Settled at ${(stats.complaint_rate * 100).toFixed(2)}% complaints: $${usd(capturedCents)} forfeited`);
  return getCampaign(id);
}

// Refresh payout statuses from PayPal (also covers missed webhooks).
export async function refreshPayouts() {
  const pending = db()
    .prepare("SELECT DISTINCT batch_id FROM payouts WHERE status NOT IN ('SUCCESS', 'DENIED', 'FAILED', 'CANCELED') AND batch_id IS NOT NULL")
    .all() as { batch_id: string }[];
  for (const { batch_id } of pending) {
    try {
      const batch = await getPayoutBatch(batch_id);
      const update = db().prepare("UPDATE payouts SET status = ?, item_id = ? WHERE batch_id = ? AND persona_id = ?");
      for (const item of batch.items ?? []) {
        const personaId = item.payout_item.sender_item_id.split("-").slice(1).join("-");
        update.run(item.transaction_status, item.payout_item_id, batch_id, personaId);
      }
    } catch {
      // keep the old status; try again next refresh
    }
  }
}

export function resetDemo() {
  const d = db();
  d.exec("DELETE FROM campaigns; DELETE FROM deliveries; DELETE FROM payouts; DELETE FROM events; DELETE FROM personas;");
  ensurePersonas();
  logEvent(null, "reset", "Demo reset");
}
