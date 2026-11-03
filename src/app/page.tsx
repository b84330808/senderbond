import Link from "next/link";
import { Card } from "@/components/ui";

const STEPS = [
  {
    title: "AI prices the risk",
    body: "Before a campaign goes out, an AI reviewer reads it like a deliverability analyst and sets a bond: wanted mail pays little, spammy mail pays a lot.",
  },
  {
    title: "PayPal holds the bond",
    body: "The sender approves a PayPal payment with intent AUTHORIZE. The money is held, not charged, while the campaign is out.",
  },
  {
    title: "Recipients decide",
    body: "For 72 hours the ESP counts spam reports. Under 0.1% the hold is voided; above 0.3% (the Gmail / Yahoo limit) it is captured.",
  },
  {
    title: "Reporters get rewarded",
    body: "Half of a forfeited bond is paid to the people who reported the spam, through PayPal Payouts. Reward farming is screened by AI.",
  },
];

const ROLES = [
  { href: "/sender", title: "Sender", body: "Write a campaign, see the AI review, post the bond with PayPal, send and watch the result." },
  { href: "/inbox", title: "Inbox", body: "Be a recipient: open, reply, unsubscribe or report spam, and collect a reward." },
  { href: "/esp", title: "ESP console", body: "The provider's view: every bond, complaint rate, PayPal transaction and payout." },
];

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="max-w-3xl space-y-4">
        <p className="text-sm font-medium text-emerald-700">For email service providers and the senders they trust</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">A refundable deposit for email senders.</h1>
        <p className="text-lg text-zinc-600">
          One bad sender on a shared IP hurts every customer&apos;s deliverability, and today ESPs can only ban them after the damage is
          done. SenderBond makes new senders post a bond first: AI prices the risk, PayPal holds the money, and the recipients&apos;
          spam reports decide whether the sender gets it back.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/sender" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
            Try it as a sender
          </Link>
          <Link href="/esp" className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50">
            Open the ESP console
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <Card key={s.title}>
            <div className="mb-3 grid h-7 w-7 place-items-center rounded-full bg-emerald-600 text-sm font-semibold text-white">{i + 1}</div>
            <h2 className="font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm text-zinc-600">{s.body}</p>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Walk through the demo</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {ROLES.map((r) => (
            <Link key={r.href} href={r.href} className="group">
              <Card className="h-full transition group-hover:border-zinc-400">
                <h3 className="font-semibold">{r.title} →</h3>
                <p className="mt-1 text-sm text-zinc-600">{r.body}</p>
              </Card>
            </Link>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          Everything runs on the PayPal sandbox. Most of each mailing list is a labelled simulation; the three demo inboxes are real and
          every click there changes the outcome.
        </p>
      </section>
    </div>
  );
}
