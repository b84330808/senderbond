import { PAYPAL_API, paypalConfig } from "./env";

// Thin REST client for the PayPal sandbox: OAuth, Orders v2 (AUTHORIZE),
// Payments v2 (capture / void), Payouts v1 and webhook verification.

export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
    public details: unknown,
  ) {
    super(message);
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const { clientId, clientSecret } = paypalConfig();
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = await res.json();
  if (!res.ok) throw new PayPalError("PayPal OAuth failed", res.status, json);
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

async function call<T>(method: string, pathname: string, body?: unknown, requestId?: string): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  // Same PayPal-Request-Id = same result, so retries never double-capture or double-pay.
  if (requestId) headers["PayPal-Request-Id"] = requestId;
  const res = await fetch(`${PAYPAL_API}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const issue = json?.details?.[0]?.issue ?? json?.name ?? "UNKNOWN";
    throw new PayPalError(`PayPal ${method} ${pathname} failed: ${issue}`, res.status, json);
  }
  return json as T;
}

export const usd = (cents: number) => (cents / 100).toFixed(2);

type Order = {
  id: string;
  status: string;
  purchase_units?: { payments?: { authorizations?: { id: string; status: string; expiration_time?: string }[] } }[];
};

export function createBondOrder(opts: { campaignId: string; amountCents: number; description: string }) {
  return call<Order>(
    "POST",
    "/v2/checkout/orders",
    {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: opts.campaignId,
          custom_id: opts.campaignId,
          description: opts.description.slice(0, 127),
          soft_descriptor: "SENDERBOND",
          amount: { currency_code: "USD", value: usd(opts.amountCents) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "SenderBond",
            shipping_preference: "NO_SHIPPING",
            user_action: "CONTINUE",
          },
        },
      },
    },
    `order-${opts.campaignId}-${opts.amountCents}`,
  );
}

export async function authorizeOrder(orderId: string) {
  const order = await call<Order>("POST", `/v2/checkout/orders/${orderId}/authorize`, {}, `authorize-${orderId}`);
  const auth = order.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth) throw new PayPalError("Order authorized but no authorization was returned", 500, order);
  return { orderStatus: order.status, authorizationId: auth.id, authorizationStatus: auth.status, expiresAt: auth.expiration_time };
}

type Capture = { id: string; status: string; amount?: { value: string } };

// final_capture=true releases whatever is left on the authorization back to the sender.
export function captureAuthorization(authorizationId: string, amountCents: number) {
  return call<Capture>(
    "POST",
    `/v2/payments/authorizations/${authorizationId}/capture`,
    { amount: { currency_code: "USD", value: usd(amountCents) }, final_capture: true },
    `capture-${authorizationId}`,
  );
}

export function voidAuthorization(authorizationId: string) {
  return call<Record<string, unknown>>("POST", `/v2/payments/authorizations/${authorizationId}/void`, undefined, `void-${authorizationId}`);
}

export function getAuthorization(authorizationId: string) {
  return call<{ id: string; status: string; amount: { value: string } }>("GET", `/v2/payments/authorizations/${authorizationId}`);
}

type PayoutBatch = {
  batch_header: { payout_batch_id: string; batch_status: string };
  items?: { payout_item_id: string; transaction_status: string; payout_item: { sender_item_id: string } }[];
};

export function createPayoutBatch(batchId: string, items: { senderItemId: string; email: string; amountCents: number; note: string }[]) {
  return call<PayoutBatch>(
    "POST",
    "/v1/payments/payouts",
    {
      sender_batch_header: {
        sender_batch_id: batchId,
        email_subject: "You earned a SenderBond reporter reward",
        email_message: "Thanks for reporting spam. Part of the sender's forfeited bond is yours.",
      },
      items: items.map((item) => ({
        recipient_type: "EMAIL",
        receiver: item.email,
        sender_item_id: item.senderItemId,
        note: item.note,
        amount: { currency: "USD", value: usd(item.amountCents) },
      })),
    },
    batchId,
  );
}

export function getPayoutBatch(payoutBatchId: string) {
  return call<PayoutBatch>("GET", `/v1/payments/payouts/${payoutBatchId}`);
}

export async function verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
  const { webhookId } = paypalConfig();
  if (!webhookId) return false;
  const result = await call<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: event,
  });
  return result.verification_status === "SUCCESS";
}
