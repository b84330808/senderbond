import { z } from "zod";
import { chatJson } from "./ai";

// AI pre-send review: reads the campaign like a deliverability analyst and
// scores how likely recipients are to report it. The bond price itself is
// computed by deterministic code from that score, never by the model.

export const ReviewSchema = z.object({
  risk_score: z.number().min(0).max(100),
  risk_tier: z.enum(["low", "medium", "high"]),
  summary: z.string().min(1),
  predicted_complaint_rate_pct: z.number().min(0).max(100),
  signals: z
    .array(
      z.object({
        label: z.string(),
        severity: z.enum(["low", "medium", "high"]),
        evidence: z.string(),
        why: z.string(),
      }),
    )
    .max(8),
  compliance: z.object({
    unsubscribe_link: z.boolean(),
    physical_address: z.boolean(),
    sender_identified: z.boolean(),
    deceptive_subject: z.boolean(),
  }),
});
export type Review = z.infer<typeof ReviewSchema>;

const SYSTEM = `You are the pre-send risk reviewer at an email service provider (ESP).
Before a marketing campaign is sent, you estimate how likely recipients are to mark it as spam.
Mailbox providers such as Gmail and Yahoo require bulk senders to keep their spam complaint rate below 0.3%.

Judge only what is in the email. Look for: deceptive or alarming subject lines, fake urgency, fake "RE:" or account notices,
prize or money claims, misleading sender identity, missing unsubscribe link, missing postal address (CAN-SPAM),
link-heavy or image-only bodies, and anything a recipient would not expect from a brand they signed up for.
Also note genuine value: relevant content, clear sender, easy opt-out.

Reply with JSON only, exactly this shape:
{
  "risk_score": 0-100 integer (0 = clearly wanted mail, 100 = obvious spam),
  "risk_tier": "low" | "medium" | "high"   (low < 35 <= medium < 70 <= high),
  "summary": one sentence for the sender,
  "predicted_complaint_rate_pct": your estimate of the spam complaint rate in percent, e.g. 0.05,
  "signals": up to 6 items { "label": short human-readable name in Title Case (e.g. "Fake urgency", "Clear opt-out"), "severity": "low"|"medium"|"high", "evidence": exact short quote from the email (empty string if the signal is something missing), "why": one sentence },
  "compliance": { "unsubscribe_link": boolean, "physical_address": boolean, "sender_identified": boolean, "deceptive_subject": boolean }
}`;

export async function reviewCampaign(c: { sender_name: string; sender_email: string; subject: string; body: string }) {
  const user = `From: ${c.sender_name} <${c.sender_email}>
Subject: ${c.subject}

${c.body}`;
  return chatJson({ task: "pre-send-review-v1", system: SYSTEM, user, schema: ReviewSchema });
}

// --- Bond pricing (deterministic) ---------------------------------------

const PER_THOUSAND_CENTS = { low: 1000, medium: 3000, high: 8000 } as const;
const COMPLIANCE_SURCHARGE_CENTS = 1000; // per failed item, per 1,000 recipients
const MIN_BOND_CENTS = 1000;
const MAX_BOND_CENTS = 50000;

export type BondLine = { label: string; cents: number };

export function priceBond(review: Review, listSize: number): { cents: number; lines: BondLine[] } {
  const thousands = Math.max(1, listSize / 1000);
  const lines: BondLine[] = [
    {
      label: `${review.risk_tier} risk: $${PER_THOUSAND_CENTS[review.risk_tier] / 100} per 1,000 recipients × ${thousands.toLocaleString("en-US")}`,
      cents: Math.round(PER_THOUSAND_CENTS[review.risk_tier] * thousands),
    },
  ];
  const failed: string[] = [];
  if (!review.compliance.unsubscribe_link) failed.push("no unsubscribe link");
  if (!review.compliance.physical_address) failed.push("no postal address");
  if (!review.compliance.sender_identified) failed.push("sender not identified");
  if (review.compliance.deceptive_subject) failed.push("deceptive subject");
  for (const item of failed) {
    lines.push({ label: `Compliance surcharge: ${item}`, cents: Math.round(COMPLIANCE_SURCHARGE_CENTS * thousands) });
  }
  const raw = lines.reduce((sum, l) => sum + l.cents, 0);
  const cents = Math.min(MAX_BOND_CENTS, Math.max(MIN_BOND_CENTS, raw));
  if (cents !== raw) lines.push({ label: cents > raw ? "Minimum bond" : "Maximum bond cap", cents: cents - raw });
  return { cents, lines };
}
