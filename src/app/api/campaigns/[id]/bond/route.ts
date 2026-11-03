import { startBond } from "@/lib/campaigns";
import { handle } from "@/lib/http";

// Called by the PayPal button: creates an Orders v2 order with intent AUTHORIZE.
export async function POST(_req: Request, ctx: RouteContext<"/api/campaigns/[id]/bond">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return { orderId: await startBond(id) };
  });
}
