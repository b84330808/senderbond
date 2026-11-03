import { db } from "@/lib/db";
import { createAndReview, NewCampaignSchema, serialize, type CampaignRow } from "@/lib/campaigns";
import { handle } from "@/lib/http";

export async function GET() {
  return handle(() => {
    const rows = db().prepare("SELECT * FROM campaigns ORDER BY created_at DESC").all() as CampaignRow[];
    return { campaigns: rows.map(serialize) };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const input = NewCampaignSchema.parse(await request.json());
    return { campaign: serialize(await createAndReview(input)) };
  });
}
