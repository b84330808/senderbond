import { logEvent } from "@/lib/db";
import { verifyWebhook } from "@/lib/paypal";

// PayPal webhooks (authorization voided / captured, payout item status).
// The app also polls PayPal, so a missed webhook never blocks the demo.
export async function POST(request: Request) {
  const event = await request.json();
  let verified = false;
  try {
    verified = await verifyWebhook(request.headers, event);
  } catch (err) {
    console.error("webhook verification failed", err);
  }
  if (!verified) return Response.json({ ok: false }, { status: 400 });
  const resource = event.resource ?? {};
  const campaignId: string | null = resource.custom_id ?? resource.payout_item?.sender_item_id?.split("-")[0] ?? null;
  logEvent(campaignId, "webhook", `PayPal webhook ${event.event_type}`, { id: event.id, summary: event.summary });
  return Response.json({ ok: true });
}
