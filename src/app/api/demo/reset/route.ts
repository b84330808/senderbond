import { resetDemo } from "@/lib/campaigns";
import { handle } from "@/lib/http";

// Wipes campaigns, inbox and payouts so the next judge starts clean (AI cache is kept).
export async function POST() {
  return handle(() => {
    resetDemo();
    return { ok: true };
  });
}
