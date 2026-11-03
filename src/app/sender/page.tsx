"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, tierTone } from "@/components/ui";
import { api, money, pct, usePoll } from "@/lib/client";
import type { serialize } from "@/lib/campaigns";

type Campaign = ReturnType<typeof serialize>;

const PRESETS = [
  {
    key: "newsletter",
    label: "Opt-in newsletter",
    audience: "opted_in" as const,
    sender_name: "Kumo Coffee Roasters",
    sender_email: "hello@kumocoffee.example",
    subject: "Your November roast: Ethiopia Guji + a 4-minute pour-over guide",
    body: `Hi there,

Thanks for being on the Kumo Coffee list. This month's subscriber roast is a washed Ethiopia Guji: bright and floral, with notes of peach and black tea.

In this issue:
- Brewing notes: a 4-minute pour-over recipe (15 g coffee, 250 g water, 93°C)
- Behind the roast: why we roast Guji lighter than our house blend
- Subscribers get free shipping on orders over $30 until Nov 30

Brew guide: https://kumocoffee.example/guides/guji-pourover

See you next month,
Aiko from Kumo Coffee

You're receiving this because you subscribed at kumocoffee.example.
Unsubscribe in one click: https://kumocoffee.example/unsubscribe
Kumo Coffee Roasters, 2-14-3 Kuramae, Taito-ku, Tokyo 111-0051, Japan`,
  },
  {
    key: "blast",
    label: "Spammy promo blast",
    audience: "scraped" as const,
    sender_name: "Account Rewards Team",
    sender_email: "no-reply@claim-reward-now.example",
    subject: "RE: Your account - FINAL NOTICE: claim your $500 reward!!!",
    body: `CONGRATULATIONS!!!

You have been SELECTED to receive a $500 reward. This offer EXPIRES IN 24 HOURS.

Act now before it's too late -> http://claim-reward-now.example/win?id=88231
Act now before it's too late -> http://claim-reward-now.example/win?id=88231

No purchase necessary*. 100% GUARANTEED. Limited spots left!!!

*Terms apply.`,
  },
];

const STATUS_LABEL: Record<string, string> = {
  reviewed: "Needs bond",
  bond_pending: "Bond pending",
  bonded: "Bond held",
  sending: "Complaint window",
  settled: "Settled",
};

export default function SenderPage() {
  const router = useRouter();
  const { data } = usePoll<{ campaigns: Campaign[] }>("/api/campaigns", 6000);
  const [form, setForm] = useState({ ...PRESETS[0], list_size: 1000 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, value: string | number) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { campaign } = await api<{ campaign: Campaign }>("/api/campaigns", {
        body: {
          sender_name: form.sender_name,
          sender_email: form.sender_email,
          subject: form.subject,
          body: form.body,
          list_size: Number(form.list_size),
          audience: form.audience,
        },
      });
      router.push(`/sender/${campaign.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">New campaign</h1>
            <p className="text-sm text-zinc-500">The AI reviews it and prices your bond before anything is sent.</p>
          </div>
          <div className="flex gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setForm((f) => ({ ...f, ...p }))}
                className={`rounded-full border px-3 py-1 text-xs ${form.key === p.key ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 hover:bg-zinc-50"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-zinc-600">From name</span>
            <input className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2" value={form.sender_name} onChange={(e) => update("sender_name", e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="text-zinc-600">From address</span>
            <input className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2" value={form.sender_email} onChange={(e) => update("sender_email", e.target.value)} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-zinc-600">Subject</span>
            <input className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2" value={form.subject} onChange={(e) => update("subject", e.target.value)} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-zinc-600">Body</span>
            <textarea
              className="mt-1 h-64 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs leading-relaxed"
              value={form.body}
              onChange={(e) => update("body", e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-600">Recipients</span>
            <input
              type="number"
              min={100}
              max={50000}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              value={form.list_size}
              onChange={(e) => update("list_size", e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-zinc-600">Simulated audience (demo control)</span>
            <select className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2" value={form.audience} onChange={(e) => update("audience", e.target.value)}>
              <option value="opted_in">Opted-in subscribers</option>
              <option value="scraped">Scraped / purchased list</option>
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          The audience setting only drives the simulated part of the list. The AI reviewer never sees it: like a real ESP, it judges the email
          itself.
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4">
          <Button onClick={submit} disabled={busy}>
            {busy ? "AI is reviewing your campaign…" : "Review & price my bond"}
          </Button>
        </div>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-600">Your campaigns</h2>
        {data?.campaigns.length === 0 && <p className="text-sm text-zinc-500">No campaigns yet.</p>}
        {data?.campaigns.map((c) => (
          <Link key={c.id} href={`/sender/${c.id}`} className="block">
            <Card className="p-4 transition hover:border-zinc-400">
              <div className="flex items-center justify-between gap-2">
                <Badge tone={tierTone(c.risk_tier)}>{c.risk_tier} risk</Badge>
                <span className="text-xs text-zinc-500">{STATUS_LABEL[c.status] ?? c.status}</span>
              </div>
              <div className="mt-2 line-clamp-2 text-sm font-medium">{c.subject}</div>
              <div className="mt-1 text-xs text-zinc-500">
                Bond {money(c.bond_cents)}
                {c.sent_at ? ` · complaints ${pct(c.stats.complaint_rate)}` : ""}
                {c.settlement ? ` · forfeited ${money(c.settlement.captured_cents)}` : ""}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
