import { z } from "zod";
import { react } from "@/lib/campaigns";
import { handle } from "@/lib/http";

const Body = z.object({
  action: z.enum(["open", "report", "unsubscribe", "reply"]),
  text: z.string().max(2000).optional(),
});

export async function POST(request: Request, ctx: RouteContext<"/api/deliveries/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { action, text } = Body.parse(await request.json());
    await react(id, action, text);
    return { ok: true };
  });
}
