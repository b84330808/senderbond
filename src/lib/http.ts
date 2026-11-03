import { PayPalError } from "./paypal";

// Shared error handling for route handlers: always answer JSON.
export async function handle(fn: () => Promise<unknown> | unknown): Promise<Response> {
  try {
    const result = await fn();
    return Response.json(result ?? { ok: true });
  } catch (err) {
    const status = err instanceof PayPalError ? 502 : 400;
    const details = err instanceof PayPalError ? err.details : undefined;
    console.error(err);
    return Response.json({ error: (err as Error).message, details }, { status });
  }
}
