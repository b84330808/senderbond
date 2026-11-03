import { db } from "@/lib/db";
import { listPersonas, refreshPayouts } from "@/lib/campaigns";
import { handle } from "@/lib/http";

export async function GET(request: Request) {
  return handle(async () => {
    const personas = listPersonas();
    const personaId = new URL(request.url).searchParams.get("persona") || personas[0].id;
    await refreshPayouts();
    const messages = db()
      .prepare(
        `SELECT d.id AS delivery_id, d.reaction, d.reply_text, d.reply_json, d.counts_as_complaint,
                c.id AS campaign_id, c.sender_name, c.sender_email, c.subject, c.body, c.sent_at, c.status, c.sim_hours
         FROM deliveries d JOIN campaigns c ON c.id = d.campaign_id
         WHERE d.persona_id = ? ORDER BY c.sent_at DESC`,
      )
      .all(personaId);
    const payouts = db()
      .prepare(
        `SELECT p.*, c.subject FROM payouts p JOIN campaigns c ON c.id = p.campaign_id WHERE p.persona_id = ? ORDER BY p.created_at DESC`,
      )
      .all(personaId);
    return { personas, personaId, messages, payouts };
  });
}
