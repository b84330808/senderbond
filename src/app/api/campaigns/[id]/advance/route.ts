import { z } from "zod";
import { advanceTime, serialize } from "@/lib/campaigns";
import { handle } from "@/lib/http";

// Demo clock: move the 72h complaint window forward. Settles automatically at 72h.
export async function POST(request: Request, ctx: RouteContext<"/api/campaigns/[id]/advance">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { hours } = z.object({ hours: z.number().min(1).max(72) }).parse(await request.json());
    return { campaign: serialize(await advanceTime(id, hours)) };
  });
}
