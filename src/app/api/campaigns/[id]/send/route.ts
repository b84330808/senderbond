import { sendCampaign, serialize } from "@/lib/campaigns";
import { handle } from "@/lib/http";

export async function POST(_req: Request, ctx: RouteContext<"/api/campaigns/[id]/send">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return { campaign: serialize(sendCampaign(id)) };
  });
}
