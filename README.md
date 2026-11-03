# SenderBond

**A refundable deposit for email senders.** AI prices the risk before a campaign is sent, PayPal holds the bond, and the recipients' spam reports decide whether the sender gets it back.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/) with the PayPal developer platform (sandbox) and Groq / Gemini.

> Everything runs on the **PayPal sandbox**. No real money moves. The app refuses to start unless `PAYPAL_ENV=sandbox`, and its PayPal base URL is hard-coded to `api-m.sandbox.paypal.com`.

---

## The problem

Email service providers (ESPs) put many customers on shared sending IPs. One sender who blasts a scraped list gets spam complaints, the shared IPs lose reputation with Gmail and Yahoo, and **every customer's mail starts landing in spam**. Since 2024 Gmail and Yahoo require bulk senders to keep their spam-complaint rate under **0.3%**.

Today an ESP can only react after the damage: suspend the account, clean up, warm the IPs again. New senders, meanwhile, wait days for manual review and IP warm-up before they may send at volume.

## The idea

Make new senders post a **bond** before a campaign goes out, and let the people who receive the mail decide whether the sender keeps it.

1. **AI prices the risk.** An AI reviewer reads the campaign like a deliverability analyst (deceptive subject, fake urgency, prize claims, missing unsubscribe link or postal address…) and gives it a risk tier. Deterministic code turns the tier into a bond price.
2. **PayPal holds the bond.** The sender approves a PayPal payment created with `intent: AUTHORIZE`. The money is held, not charged.
3. **Recipients decide.** For 72 hours the ESP counts spam reports (including replies the AI reads as "stop emailing me").
   - under **0.1%** → the authorization is **voided**, full refund
   - **0.1%–0.3%** → a proportional **partial capture**, the rest is released
   - over **0.3%** → the whole bond is **captured**
4. **Reporters get rewarded.** Half of a forfeited bond is split among the people who reported the spam (capped at $0.50 each) and paid with **PayPal Payouts**. An AI check withholds rewards from accounts that look like they report wanted mail just to farm rewards.

Good senders pay nothing. Bad senders pay before they can hurt anyone else's deliverability.

## How PayPal is used

| Step | PayPal API | Code |
|---|---|---|
| Sender approves the bond | **JS SDK v6** (`createInstance`, `findEligibleMethods`, `createPayPalOneTimePaymentSession`, `<paypal-button>`) | `src/components/PayPalBondButton.tsx` |
| Create the bond | **Orders v2** `POST /v2/checkout/orders` with `intent: AUTHORIZE` | `src/lib/paypal.ts` `createBondOrder` |
| Hold the money | **Orders v2** `POST /v2/checkout/orders/{id}/authorize` | `authorizeOrder` |
| Full refund | **Payments v2** `POST /v2/payments/authorizations/{id}/void` | `voidAuthorization` |
| Partial or full forfeit | **Payments v2** `POST /v2/payments/authorizations/{id}/capture` with `final_capture: true` (the remainder is released) | `captureAuthorization` |
| Reward reporters | **Payouts** `POST /v1/payments/payouts`, status via `GET /v1/payments/payouts/{id}` | `createPayoutBatch`, `refreshPayouts` |
| Notifications | **Webhooks** with `POST /v1/notifications/verify-webhook-signature` | `src/app/api/paypal/webhook/route.ts` |

Every mutating call carries a `PayPal-Request-Id`, so a retry never double-captures or double-pays.

## How AI is used

The model never moves money by itself: **AI judges, deterministic code computes amounts, PayPal executes.**

| Task | What the AI does | Effect |
|---|---|---|
| Pre-send review | Scores the campaign 0–100, lists evidence-backed risk signals and a compliance checklist, predicts the complaint rate | Sets the risk tier, which sets the bond price |
| Reply classification | Reads a recipient's reply: interested / question / not interested / angry "stop" / auto-reply | An angry "stop emailing me" counts as a complaint |
| Reward-farming check | Looks at a reporter's history across campaigns | Withholds the Payouts reward when it looks like farming |
| Settlement notice | Writes the sender a short explanation comparing prediction and outcome, with one tip | Shown on the settlement screen |

Provider: **Groq** (`openai/gpt-oss-120b`) first, **Google Gemini** (`gemini-3.5-flash-lite`) as automatic fallback on errors or rate limits. Both are called through the OpenAI-compatible chat API with JSON output, validated with zod and retried once on a schema mismatch. Results are cached by prompt hash, so replaying the demo costs no tokens.

## Try it (judges)

Hosted demo: **https://weilunli.me/senderbond**

1. **Sender** → pick a preset ("Opt-in newsletter" or "Spammy promo blast") → **Review & price my bond**. Read the AI review and the bond price.
2. Click **Pay with PayPal**. In the PayPal **sandbox** window, log in with the sandbox buyer account below and press **Complete Purchase** (pay with the sandbox PayPal balance).
3. **Send** the campaign.
4. Open **Inbox** in another tab. As Maya, Diego or Priya, open the email and **Report spam**, **Unsubscribe**, or **Reply** (try "I never signed up, stop emailing me").
5. Back on the campaign, press **+24h** or **Close window & settle**. Watch PayPal void or capture the bond and pay reporter rewards.
6. **ESP console** shows every bond, complaint rate, PayPal capture and payout. **Reset demo** clears it for the next person.

**Sandbox buyer account:** the login is in the Devpost submission's testing instructions (PayPal sandbox only, fake money). Any PayPal sandbox personal account works too.

What is simulated: a campaign goes to N recipients, of which three are live demo inboxes. The rest of the list is a clearly labelled simulation whose reaction rates depend on the "Simulated audience" demo control (opted-in vs scraped). The AI never sees that setting; like a real ESP it only judges the email. The 72-hour window runs on a demo clock.

## Run it locally

Requirements: **Node.js 24+** (uses the built-in `node:sqlite`), a PayPal developer account with a sandbox REST app, and a free Groq and/or Gemini API key.

```bash
git clone <this repo>
cd senderbond
npm install
cp .env.example .env   # fill in the keys
npm run dev            # http://localhost:3000
```

`.env`:

| Variable | Where to get it |
|---|---|
| `PAYPAL_ENV` | must be `sandbox` |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | developer.paypal.com → Apps & Credentials (Sandbox) |
| `PAYPAL_WEBHOOK_ID` | optional, after registering `/api/paypal/webhook` in the app settings |
| `GROQ_API_KEY`, `GROQ_MODEL` | console.groq.com (free plan) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | aistudio.google.com (free tier) |
| `DATA_DIR` | optional, where the SQLite file lives (default `./data`) |
| `NEXT_PUBLIC_BASE_PATH` | optional, build time: serve under a path prefix such as `/senderbond` |

The sandbox business account behind the app needs a USD balance for Payouts.

## Deploy

`npm run build` produces a self-contained server in `.next/standalone` (`output: "standalone"`). Copy `.next/static` to `.next/standalone/.next/static` and `public` to `.next/standalone/public`, then run `node server.js` with the environment variables above and `PORT` / `HOSTNAME`.

The hosted demo runs exactly that on a small Linux VM: Node 24 under systemd, behind Caddy and Cloudflare, built with `NEXT_PUBLIC_BASE_PATH=/senderbond`. A `render.yaml` Blueprint is also included for one-click deploys to Render (web service + 1 GB disk for SQLite).

## Architecture

```
Browser (Next.js pages)                    Server (Next.js route handlers)
  Sender / Inbox / ESP console  ── fetch ─▶  /api/campaigns, /api/inbox, /api/esp …
  PayPal JS SDK v6 button  ──── onApprove ─▶  /api/campaigns/:id/bond/authorize
                                               │
                                               ├─ src/lib/review.ts     AI review + rule-based bond price
                                               ├─ src/lib/campaigns.ts  flow, stats, settlement rules
                                               ├─ src/lib/paypal.ts     Orders v2, Payments v2, Payouts
                                               ├─ src/lib/ai.ts         Groq → Gemini fallback, cache
                                               └─ src/lib/db.ts         SQLite (node:sqlite)
```

Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, AG Grid 36, zod 4, SQLite via `node:sqlite`.

## License

[MIT](LICENSE)
