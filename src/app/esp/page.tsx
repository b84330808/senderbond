"use client";

import { useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { Badge, Button, Card, Stat } from "@/components/ui";
import { api, money, pct, usePoll } from "@/lib/client";
import type { serialize } from "@/lib/campaigns";

ModuleRegistry.registerModules([AllCommunityModule]);

type Campaign = ReturnType<typeof serialize>;
type PayoutRow = { id: string; persona_name: string; subject: string; amount_cents: number; status: string; batch_id: string; paypal_email: string; created_at: number };
type EventRow = { id: number; ts: number; kind: string; message: string; campaign_id: string | null };
type Reporter = { id: string; name: string; address: string; paypal_email: string | null; received: number; reported: number; rewards_cents: number };
type EspData = { campaigns: Campaign[]; payouts: PayoutRow[]; events: EventRow[]; reporters: Reporter[] };

const theme = themeQuartz.withParams({ fontSize: 13, headerFontSize: 12, spacing: 6 });

const STATUS_TONE: Record<string, "zinc" | "green" | "amber" | "red" | "blue"> = {
  reviewed: "zinc",
  bond_pending: "amber",
  bonded: "blue",
  sending: "blue",
  settled: "green",
};

type CampaignRowView = {
  id: string;
  sender: string;
  subject: string;
  risk: string;
  score: number;
  bond: number;
  status: string;
  complaint_rate: number;
  hours: number;
  forfeited: number | null;
  returned: number | null;
  authorization: string | null;
};

export default function EspPage() {
  const { data, reload } = usePoll<EspData>("/api/esp", 5000);
  const [busy, setBusy] = useState(false);

  const rows: CampaignRowView[] = useMemo(
    () =>
      (data?.campaigns ?? []).map((c) => ({
        id: c.id,
        sender: c.sender_name,
        subject: c.subject,
        risk: c.risk_tier ?? "",
        score: c.review?.risk_score ?? 0,
        bond: c.bond_cents ?? 0,
        status: c.status,
        complaint_rate: c.stats.complaint_rate,
        hours: c.sim_hours,
        forfeited: c.settlement?.captured_cents ?? null,
        returned: c.settlement?.released_cents ?? null,
        authorization: c.authorization_id,
      })),
    [data],
  );

  const campaignCols = useMemo<ColDef<CampaignRowView>[]>(
    () => [
      { field: "sender", headerName: "Sender", minWidth: 150 },
      { field: "subject", headerName: "Subject", flex: 2, minWidth: 220 },
      {
        field: "risk",
        headerName: "AI risk",
        width: 110,
        cellRenderer: (p: { value: string; data: CampaignRowView }) => (
          <Badge tone={p.value === "low" ? "green" : p.value === "medium" ? "amber" : "red"}>
            {p.value} · {p.data.score}
          </Badge>
        ),
      },
      { field: "bond", headerName: "Bond", width: 100, valueFormatter: (p) => money(p.value) },
      {
        field: "status",
        headerName: "Status",
        width: 130,
        cellRenderer: (p: { value: string }) => <Badge tone={STATUS_TONE[p.value] ?? "zinc"}>{p.value.replace("_", " ")}</Badge>,
      },
      {
        field: "complaint_rate",
        headerName: "Complaints",
        width: 115,
        valueFormatter: (p) => pct(p.value, 3),
        cellClassRules: {
          "text-red-600 font-semibold": (p) => p.value >= 0.003,
          "text-amber-600": (p) => p.value >= 0.001 && p.value < 0.003,
        },
      },
      { field: "hours", headerName: "Window", width: 90, valueFormatter: (p) => `${p.value}h` },
      { field: "forfeited", headerName: "Forfeited", width: 110, valueFormatter: (p) => (p.value == null ? "—" : money(p.value)) },
      { field: "returned", headerName: "Returned", width: 110, valueFormatter: (p) => (p.value == null ? "—" : money(p.value)) },
      { field: "authorization", headerName: "PayPal authorization", minWidth: 170 },
    ],
    [],
  );

  const payoutCols = useMemo<ColDef<PayoutRow>[]>(
    () => [
      { field: "persona_name", headerName: "Reporter", width: 120 },
      { field: "amount_cents", headerName: "Reward", width: 90, valueFormatter: (p) => money(p.value) },
      {
        field: "status",
        headerName: "PayPal status",
        width: 120,
        cellRenderer: (p: { value: string }) => <Badge tone={p.value === "SUCCESS" ? "green" : "amber"}>{p.value}</Badge>,
      },
      { field: "batch_id", headerName: "Payout batch", width: 150 },
      { field: "subject", headerName: "Campaign", flex: 1, minWidth: 180 },
    ],
    [],
  );

  const reporterCols = useMemo<ColDef<Reporter>[]>(
    () => [
      { field: "name", headerName: "Recipient", width: 120 },
      { field: "received", headerName: "Received", width: 95 },
      { field: "reported", headerName: "Reported", width: 95 },
      {
        headerName: "Report rate",
        width: 105,
        valueGetter: (p) => (p.data && p.data.received ? p.data.reported / p.data.received : 0),
        valueFormatter: (p) => pct(p.value, 0),
      },
      { field: "rewards_cents", headerName: "Rewards", width: 100, valueFormatter: (p) => money(p.value) },
      { field: "paypal_email", headerName: "PayPal email", flex: 1, minWidth: 200 },
    ],
    [],
  );

  if (!data) return <p className="text-zinc-500">Loading…</p>;

  const held = data.campaigns.filter((c) => ["bonded", "sending"].includes(c.status)).reduce((s, c) => s + (c.bond_cents ?? 0), 0);
  const settled = data.campaigns.filter((c) => c.settlement);
  const forfeited = settled.reduce((s, c) => s + (c.settlement?.captured_cents ?? 0), 0);
  const fund = settled.reduce((s, c) => s + (c.settlement?.esp_fund_cents ?? 0), 0);
  const rewards = data.payouts.reduce((s, p) => s + p.amount_cents, 0);

  async function reset() {
    if (!confirm("Reset the demo? This deletes all campaigns, inbox messages and payout records (PayPal sandbox history stays).")) return;
    setBusy(true);
    try {
      await api("/api/demo/reset", { body: {} });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">ESP console</h1>
          <p className="text-sm text-zinc-500">Every sender bond, complaint rate and PayPal movement, live.</p>
        </div>
        <Button variant="secondary" onClick={reset} disabled={busy}>
          Reset demo
        </Button>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-5">
          <Stat label="Campaigns" value={data.campaigns.length} />
          <Stat label="Bonds held now" value={money(held)} hint="PayPal authorizations" />
          <Stat label="Forfeited" value={money(forfeited)} hint="captured" />
          <Stat label="Paid to reporters" value={money(rewards)} hint="PayPal Payouts" />
          <Stat label="Reputation fund" value={money(fund)} />
        </div>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">Sender bonds</h2>
        <div style={{ height: 320 }}>
          <AgGridReact<CampaignRowView> theme={theme} rowData={rows} columnDefs={campaignCols} getRowId={(p) => p.data.id} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-2">
          <h2 className="font-semibold">Reporter rewards (PayPal Payouts)</h2>
          <div style={{ height: 260 }}>
            <AgGridReact<PayoutRow> theme={theme} rowData={data.payouts} columnDefs={payoutCols} getRowId={(p) => p.data.id} />
          </div>
        </Card>
        <Card className="space-y-2">
          <h2 className="font-semibold">Recipients & reporting behaviour</h2>
          <div style={{ height: 260 }}>
            <AgGridReact<Reporter> theme={theme} rowData={data.reporters} columnDefs={reporterCols} getRowId={(p) => p.data.id} />
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">Event log</h2>
        <ul className="max-h-72 space-y-1 overflow-auto text-sm">
          {data.events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="w-20 shrink-0 text-xs tabular-nums text-zinc-400">{new Date(e.ts).toLocaleTimeString()}</span>
              <span className="w-20 shrink-0 text-xs uppercase text-zinc-500">{e.kind}</span>
              <span>{e.message}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
