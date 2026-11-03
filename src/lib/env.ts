// Server-side configuration. SenderBond only ever talks to the PayPal sandbox:
// the API base URL is hard-coded and the app refuses to start otherwise.

export const PAYPAL_API = "https://api-m.sandbox.paypal.com";
export const PAYPAL_SDK_URL = "https://www.sandbox.paypal.com/web-sdk/v6/core";

function read(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. Copy .env.example to .env and fill it in.`);
  return value;
}

export function paypalConfig() {
  if (process.env.PAYPAL_ENV !== "sandbox") {
    throw new Error("SenderBond only runs against the PayPal sandbox. Set PAYPAL_ENV=sandbox.");
  }
  return {
    clientId: read("PAYPAL_CLIENT_ID"),
    clientSecret: read("PAYPAL_CLIENT_SECRET"),
    webhookId: process.env.PAYPAL_WEBHOOK_ID ?? "",
  };
}

export type AiProvider = { name: "groq" | "gemini"; url: string; apiKey: string; model: string };

// Providers in fallback order. Both speak the OpenAI chat-completions format.
export function aiProviders(): AiProvider[] {
  const providers: AiProvider[] = [];
  if (process.env.GROQ_API_KEY) {
    providers.push({
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    });
  }
  if (process.env.GEMINI_API_KEY) {
    providers.push({
      name: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    });
  }
  if (providers.length === 0) throw new Error("Set GROQ_API_KEY and/or GEMINI_API_KEY in .env.");
  return providers;
}
