import { db } from "@/lib/db";
import { getCampaign, serialize } from "@/lib/campaigns";
import { handle } from "@/lib/http";

export async function GET(_req: Request, ctx: RouteContext<"/api/campaigns/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const events = db().prepare("SELECT * FROM events WHERE campaign_id = ? ORDER BY id DESC LIMIT 50").all(id);
    return { campaign: serialize(getCampaign(id)), events };
  });
}
