import { z } from "zod";
import { db } from "@/lib/db";
import { handle } from "@/lib/http";

// A demo recipient links the PayPal (sandbox) email that receives reporter rewards.
export async function PUT(request: Request, ctx: RouteContext<"/api/personas/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { paypal_email } = z.object({ paypal_email: z.email().max(120) }).parse(await request.json());
    db().prepare("UPDATE personas SET paypal_email = ? WHERE id = ?").run(paypal_email, id);
    return { ok: true };
  });
}
