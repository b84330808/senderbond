"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { AiTag, Badge, Button, Card, Stat, tierTone } from "@/components/ui";
import { ComplaintMeter } from "@/components/ComplaintMeter";
import { PayPalBondButton } from "@/components/PayPalBondButton";
import { api, money, pct, usePoll } from "@/lib/client";
import type { serialize } from "@/lib/campaigns";

type Campaign = ReturnType<typeof serialize>;
type EventRow = { id: number; ts: number; kind: string; message: string };

const ORDER = ["reviewed", "bond_pending", "bonded", "sending", "settled"];

function Step({ n, title, done, active, children }: { n: number; title: string; done: boolean; active: boolean; children: ReactNode }) {
  return (
    <Card className={active ? "border-zinc-900" : ""}>
      <div className="mb-3 flex items-center gap-3">
        <span
          className={`grid h-7 w-7 place-items-center rounded-full text-sm font-semibold ${done ? "bg-emerald-600 text-white" : active ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-600"}`}
        >
          {done ? "✓" : n}
        </span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = usePoll<{ campaign: Campaign; events: EventRow[] }>(`/api/campaigns/${id}`, 3000);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const onAuthorized = useCallback(() => reload(), [reload]);

  async function act(label: string, url: string, body: unknown = {}) {
    setBusy(label);
    setActionError(null);
    try {
      await api(url, { body });
      await reload();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-zinc-500">Loading…</p>;
  const c = data.campaign;
  const review = c.review!;
  const stage = ORDER.indexOf(c.status);
  const s = c.stats;
  const projected = Math.round((c.bond_cents ?? 0) * s.projected_fraction);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/sender" className="text-sm text-zinc-500 hover:underline">
          ← All campaigns
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{c.subject}</h1>
        <p className="text-sm text-zinc-500">
          From {c.sender_name} &lt;{c.sender_email}&gt; · {c.list_size.toLocaleString("en-US")} recipients · simulated audience:{" "}
          {c.audience_label}
        </p>
      </div>

      {actionError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}

      <Step n={1} title="AI pre-send review" done={stage >= 0} active={false}>
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={tierTone(review.risk_tier)}>{review.risk_tier} risk</Badge>
              <span className="text-sm text-zinc-600">score {review.risk_score}/100</span>
              <span className="text-sm text-zinc-600">· predicted complaints {review.predicted_complaint_rate_pct}%</span>
              <AiTag provider={c.review_provider} />
            </div>
            <p className="text-sm">{review.summary}</p>
            <ul className="space-y-2">
              {review.signals.map((sig, i) => (
                <li key={i} className="rounded-lg border border-zinc-200 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone={tierTone(sig.severity)}>{sig.severity}</Badge>
                    <span className="font-medium">{sig.label}</span>
                  </div>
                  {sig.evidence && <p className="mt-1 font-mono text-xs text-zinc-600">“{sig.evidence}”</p>}
                  <p className="mt-1 text-zinc-600">{sig.why}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4">
            <div className="rounded-lg bg-zinc-50 p-4 text-sm">
              <div className="mb-2 font-medium">Compliance check</div>
              {[
                ["One-click unsubscribe", review.compliance.unsubscribe_link],
                ["Postal address", review.compliance.physical_address],
                ["Sender identified", review.compliance.sender_identified],
                ["Honest subject line", !review.compliance.deceptive_subject],
              ].map(([label, ok]) => (
                <div key={label as string} className="flex justify-between py-0.5">
                  <span>{label}</span>
                  <span className={ok ? "text-emerald-700" : "text-red-600"}>{ok ? "✓" : "✗"}</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-zinc-200 p-4 text-sm">
              <div className="mb-2 font-medium">Bond price (rule-based)</div>
              {c.bond_lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-3 py-0.5 text-zinc-600">
                  <span>{l.label}</span>
                  <span className="tabular-nums">{money(l.cents)}</span>
                </div>
              ))}
              <div className="mt-2 flex justify-between border-t border-zinc-200 pt-2 font-semibold">
                <span>Bond</span>
                <span className="tabular-nums">{money(c.bond_cents)}</span>
              </div>
            </div>
          </div>
        </div>
      </Step>

      <Step n={2} title="Post the bond with PayPal" done={stage >= 2} active={stage <= 1}>
        {stage <= 1 ? (
          <div className="grid gap-4 sm:grid-cols-[1fr_320px] sm:items-center">
            <p className="text-sm text-zinc-600">
              PayPal will <strong>hold {money(c.bond_cents)}</strong> on your account (Orders v2, intent AUTHORIZE). Nothing is charged
              unless your recipients report the campaign as spam.
            </p>
            <PayPalBondButton campaignId={c.id} onAuthorized={onAuthorized} />
          </div>
        ) : (
          <p className="text-sm text-zinc-600">
            {money(c.bond_cents)} held by PayPal · order <code className="text-xs">{c.paypal_order_id}</code> · authorization{" "}
            <code className="text-xs">{c.authorization_id}</code>
          </p>
        )}
      </Step>

      <Step n={3} title="Send the campaign" done={stage >= 3} active={stage === 2}>
        {stage === 2 ? (
          <Button onClick={() => act("send", `/api/campaigns/${c.id}/send`)} disabled={!!busy}>
            {busy === "send" ? "Sending…" : `Send to ${c.list_size.toLocaleString("en-US")} recipients`}
          </Button>
        ) : (
          <p className="text-sm text-zinc-600">{stage > 2 ? "Sent. The three demo inboxes received it too." : "Available after the bond is held."}</p>
        )}
      </Step>

      <Step n={4} title="72-hour complaint window" done={stage >= 4} active={stage === 3}>
        {stage >= 3 ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Recipients" value={s.recipients.toLocaleString("en-US")} hint={`${s.live_recipients} live demo inboxes`} />
              <Stat label="Opens" value={s.opens.toLocaleString("en-US")} />
              <Stat label="Unsubscribes" value={s.unsubscribes.toLocaleString("en-US")} />
              <Stat label="Spam reports" value={s.complaints} hint={`${s.simulated_complaints} simulated + ${s.live_complaints} live`} />
            </div>
            <ComplaintMeter rate={s.complaint_rate} />
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm text-zinc-600">
                Clock: <span className="font-semibold tabular-nums">{s.hours_elapsed}h</span> / {s.window_hours}h
              </div>
              {stage === 3 && (
                <>
                  <Button variant="secondary" onClick={() => act("24", `/api/campaigns/${c.id}/advance`, { hours: 24 })} disabled={!!busy}>
                    {busy === "24" ? "…" : "+24h"}
                  </Button>
                  <Button onClick={() => act("72", `/api/campaigns/${c.id}/advance`, { hours: 72 })} disabled={!!busy}>
                    {busy === "72" ? "Settling with PayPal…" : "Close window & settle"}
                  </Button>
                  <Link href="/inbox" className="text-sm text-sky-700 hover:underline">
                    React as a recipient in the Inbox →
                  </Link>
                </>
              )}
            </div>
            {stage === 3 && (
              <p className="text-sm text-zinc-600">
                If the window closed now: <strong>{money(projected)}</strong> forfeited,{" "}
                <strong>{money((c.bond_cents ?? 0) - projected)}</strong> returned.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-600">Starts when the campaign is sent.</p>
        )}
      </Step>

      <Step n={5} title="Settlement" done={stage >= 4} active={false}>
        {c.settlement ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Stat label="Complaint rate" value={pct(c.settlement.complaint_rate, 3)} />
                <Stat label="Returned to sender" value={money(c.settlement.released_cents)} />
                <Stat label="Forfeited" value={money(c.settlement.captured_cents)} />
              </div>
              <div className="rounded-lg bg-violet-50 p-4 text-sm">
                <div className="mb-1 flex items-center gap-2 font-medium">
                  Settlement notice <AiTag provider={c.settlement.letter_provider} />
                </div>
                <p className="whitespace-pre-line text-zinc-700">{c.settlement.letter}</p>
              </div>
            </div>
            <div className="space-y-1 rounded-lg border border-zinc-200 p-4 text-sm text-zinc-600">
              <div className="mb-1 font-medium text-zinc-900">PayPal</div>
              <div>
                {c.settlement.paypal_action === "void" ? "Authorization voided (full refund)" : `Captured ${money(c.settlement.captured_cents)}`}
              </div>
              {c.settlement.paypal_capture_id && <div className="font-mono text-xs">capture {c.settlement.paypal_capture_id}</div>}
              <div className="pt-2 font-medium text-zinc-900">Reporter rewards</div>
              <div>
                {c.settlement.reporter_count} reporters × {money(c.settlement.reward_per_reporter_cents)}
              </div>
              <div>Paid to live reporters: {money(c.settlement.live_rewards_cents)}</div>
              <div className="text-xs">Simulated reporters (not paid in demo): {money(c.settlement.simulated_rewards_cents)}</div>
              {c.settlement.payout_batch_id && <div className="font-mono text-xs">payout batch {c.settlement.payout_batch_id}</div>}
              {c.settlement.flagged_reporters.map((f) => (
                <div key={f.persona_id} className="text-xs text-red-600">
                  Withheld from {f.persona_id}: {f.reason}
                </div>
              ))}
              <div className="pt-2 font-medium text-zinc-900">ESP reputation fund</div>
              <div>{money(c.settlement.esp_fund_cents)}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-600">Happens automatically when the window closes.</p>
        )}
      </Step>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-zinc-600">Activity</h2>
        <ul className="space-y-1 text-sm">
          {data.events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="w-20 shrink-0 text-xs tabular-nums text-zinc-400">{new Date(e.ts).toLocaleTimeString()}</span>
              <span className="w-20 shrink-0 text-xs uppercase text-zinc-500">{e.kind}</span>
              <span>{e.message}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
