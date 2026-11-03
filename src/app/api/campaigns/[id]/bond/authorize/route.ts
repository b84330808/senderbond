import { z } from "zod";
import { confirmBond, serialize } from "@/lib/campaigns";
import { handle } from "@/lib/http";

// Called from the PayPal button's onApprove: authorizes (holds) the bond.
export async function POST(request: Request, ctx: RouteContext<"/api/campaigns/[id]/bond/authorize">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { orderId } = z.object({ orderId: z.string().min(1) }).parse(await request.json());
    return { campaign: serialize(await confirmBond(id, orderId)) };
  });
}
