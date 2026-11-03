import { db } from "@/lib/db";
import { listPersonas, refreshPayouts, serialize, type CampaignRow } from "@/lib/campaigns";
import { handle } from "@/lib/http";

export async function GET() {
  return handle(async () => {
    await refreshPayouts();
    const campaigns = (db().prepare("SELECT * FROM campaigns ORDER BY created_at DESC").all() as CampaignRow[]).map(serialize);
    const payouts = db()
      .prepare(
        `SELECT p.*, c.subject, pe.name AS persona_name FROM payouts p
         JOIN campaigns c ON c.id = p.campaign_id JOIN personas pe ON pe.id = p.persona_id ORDER BY p.created_at DESC`,
      )
      .all();
    const events = db().prepare("SELECT * FROM events ORDER BY id DESC LIMIT 100").all();
    const reporters = listPersonas().map((p) => {
      const row = db()
        .prepare(
          `SELECT COUNT(*) AS received, COALESCE(SUM(d.counts_as_complaint), 0) AS reported
           FROM deliveries d WHERE d.persona_id = ?`,
        )
        .get(p.id) as { received: number; reported: number };
      const paid = db()
        .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM payouts WHERE persona_id = ?")
        .get(p.id) as { cents: number };
      return { ...p, ...row, rewards_cents: paid.cents };
    });
    return { campaigns, payouts, events, reporters };
  });
}
