import { PAYPAL_SDK_URL, paypalConfig } from "@/lib/env";
import { handle } from "@/lib/http";

// The PayPal client ID is public by design (the JS SDK needs it in the browser).
export async function GET() {
  return handle(() => ({ paypalClientId: paypalConfig().clientId, paypalSdkUrl: PAYPAL_SDK_URL }));
}
