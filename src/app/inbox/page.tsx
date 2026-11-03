"use client";

import { useState } from "react";
import { AiTag, Badge, Button, Card } from "@/components/ui";
import { api, money, usePoll } from "@/lib/client";

type Persona = { id: string; name: string; address: string; paypal_email: string | null };
type Message = {
  delivery_id: string;
  reaction: string;
  reply_text: string | null;
  reply_json: string | null;
  counts_as_complaint: number;
  campaign_id: string;
  sender_name: string;
  sender_email: string;
  subject: string;
  body: string;
  sent_at: number;
  status: string;
  sim_hours: number;
};
type Payout = { id: string; amount_cents: number; status: string; subject: string; batch_id: string; paypal_email: string };
type InboxData = { personas: Persona[]; personaId: string; messages: Message[]; payouts: Payout[] };

const REACTION_LABEL: Record<string, { label: string; tone: "zinc" | "green" | "amber" | "red" | "blue" }> = {
  none: { label: "New", tone: "blue" },
  opened: { label: "Read", tone: "zinc" },
  replied: { label: "Replied", tone: "zinc" },
  unsubscribed: { label: "Unsubscribed", tone: "amber" },
  reported: { label: "Reported as spam", tone: "red" },
};

export default function InboxPage() {
  const [personaId, setPersonaId] = useState<string | null>(null);
  const { data, reload } = usePoll<InboxData>(`/api/inbox${personaId ? `?persona=${personaId}` : ""}`, 4000);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const persona = data?.personas.find((p) => p.id === data.personaId);

  const open = data?.messages.find((m) => m.delivery_id === openId) ?? null;
  const windowOpen = open?.status === "sending";

  async function act(action: string, deliveryId: string, text?: string) {
    setBusy(action);
    setError(null);
    try {
      await api(`/api/deliveries/${deliveryId}`, { body: { action, text } });
      if (action === "reply") setReply("");
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function openMessage(m: Message) {
    setOpenId(m.delivery_id);
    setError(null);
    if (m.reaction === "none" && m.status === "sending") await act("open", m.delivery_id);
  }

  if (!data) return <p className="text-zinc-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-500">Demo inbox of</span>
        {data.personas.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setPersonaId(p.id);
              setOpenId(null);
            }}
            className={`rounded-full border px-3 py-1 text-sm ${p.id === data.personaId ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white hover:bg-zinc-50"}`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr_280px]">
        <Card className="p-0">
          <div className="border-b border-zinc-200 px-4 py-3 text-sm font-semibold">{persona?.address}</div>
          {data.messages.length === 0 && <p className="p-4 text-sm text-zinc-500">No mail yet. Send a campaign from the Sender page.</p>}
          <ul>
            {data.messages.map((m) => (
              <li key={m.delivery_id}>
                <button
                  onClick={() => openMessage(m)}
                  className={`w-full border-b border-zinc-100 px-4 py-3 text-left hover:bg-zinc-50 ${openId === m.delivery_id ? "bg-zinc-100" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${m.reaction === "none" ? "font-semibold" : ""}`}>{m.sender_name}</span>
                    <Badge tone={REACTION_LABEL[m.reaction]?.tone}>{REACTION_LABEL[m.reaction]?.label}</Badge>
                  </div>
                  <div className="truncate text-sm text-zinc-600">{m.subject}</div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          {!open ? (
            <p className="text-sm text-zinc-500">Pick a message.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">{open.subject}</h2>
                <p className="text-sm text-zinc-500">
                  {open.sender_name} &lt;{open.sender_email}&gt;
                </p>
              </div>
              <pre className="whitespace-pre-wrap rounded-lg bg-zinc-50 p-4 font-sans text-sm leading-relaxed">{open.body}</pre>

              {windowOpen ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="danger" onClick={() => act("report", open.delivery_id)} disabled={!!busy || open.reaction === "reported"}>
                      {open.reaction === "reported" ? "Reported" : "Report spam"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => act("unsubscribe", open.delivery_id)}
                      disabled={!!busy || open.reaction === "unsubscribed" || open.reaction === "reported"}
                    >
                      Unsubscribe
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Write a reply… (the AI classifies it; an angry 'stop emailing me' counts as a complaint)"
                      className="h-20 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    />
                    <Button variant="secondary" onClick={() => act("reply", open.delivery_id, reply)} disabled={!!busy || !reply.trim()}>
                      {busy === "reply" ? "AI is reading your reply…" : "Reply"}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">The complaint window for this campaign is closed.</p>
              )}
              {open.reply_json && (
                <ReplyVerdict json={open.reply_json} text={open.reply_text} complaint={!!open.counts_as_complaint} />
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}
        </Card>

        {persona && <RewardsCard key={`${persona.id}:${persona.paypal_email}`} persona={persona} payouts={data.payouts} onSaved={reload} />}
      </div>
    </div>
  );
}

function RewardsCard({ persona, payouts, onSaved }: { persona: Persona; payouts: Payout[]; onSaved: () => Promise<void> }) {
  const [email, setEmail] = useState(persona.paypal_email ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/personas/${persona.id}`, { method: "PUT", body: { paypal_email: email } });
      await onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Reporter rewards</h2>
      <p className="text-xs text-zinc-500">
        When a campaign you reported forfeits its bond, half of it is split among reporters and paid with PayPal Payouts.
      </p>
      <label className="block text-sm">
        <span className="text-zinc-600">Your PayPal (sandbox) email</span>
        <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs" />
      </label>
      <Button variant="secondary" onClick={save} disabled={saving || email === persona.paypal_email}>
        Save
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <ul className="space-y-2 pt-2">
        {payouts.length === 0 && <li className="text-sm text-zinc-500">No rewards yet.</li>}
        {payouts.map((p) => (
          <li key={p.id} className="rounded-lg border border-zinc-200 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{money(p.amount_cents)}</span>
              <Badge tone={p.status === "SUCCESS" ? "green" : p.status === "UNCLAIMED" || p.status === "PENDING" ? "amber" : "zinc"}>{p.status}</Badge>
            </div>
            <div className="mt-1 line-clamp-1 text-xs text-zinc-500">{p.subject}</div>
            <div className="font-mono text-[10px] text-zinc-400">batch {p.batch_id}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ReplyVerdict({ json, text, complaint }: { json: string; text: string | null; complaint: boolean }) {
  const verdict = JSON.parse(json) as { intent: string; summary: string; provider?: string };
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">Your reply was read as “{verdict.intent.replace("_", " ")}”</span>
        <AiTag provider={verdict.provider} />
      </div>
      <p className="mt-1 text-zinc-600">{verdict.summary}</p>
      {complaint && <p className="mt-1 text-red-700">Counted as a spam complaint.</p>}
      {text && <p className="mt-2 border-l-2 border-violet-200 pl-2 text-xs text-zinc-500">{text}</p>}
    </div>
  );
}
