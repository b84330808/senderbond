import { createHash } from "node:crypto";
import type { z } from "zod";
import { aiProviders, type AiProvider } from "./env";
import { db } from "./db";

// JSON-only chat calls. Groq first, Gemini as fallback (429, timeout, bad JSON).
// Every successful answer is cached by prompt hash, so replaying the demo
// costs no tokens and stays inside the free tiers.

export type AiResult<T> = { data: T; provider: string; model: string; cached: boolean };

async function complete(provider: AiProvider, system: string, user: string, retryNote?: string): Promise<string> {
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  if (retryNote) messages.push({ role: "user", content: retryNote });
  const body: Record<string, unknown> = {
    model: provider.model,
    messages,
    temperature: 0.2,
    response_format: { type: "json_object" },
  };
  if (provider.name === "groq") body.reasoning_effort = "low";
  const res = await fetch(provider.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`${provider.name} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${provider.name} returned an empty message`);
  return content;
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  return JSON.parse(trimmed);
}

export async function chatJson<T>(opts: { task: string; system: string; user: string; schema: z.ZodType<T> }): Promise<AiResult<T>> {
  const key = createHash("sha256").update(`${opts.task}\n${opts.system}\n${opts.user}`).digest("hex");
  const hit = db().prepare("SELECT provider, model, response FROM ai_cache WHERE key = ?").get(key) as
    | { provider: string; model: string; response: string }
    | undefined;
  if (hit) {
    const parsed = opts.schema.safeParse(JSON.parse(hit.response));
    if (parsed.success) return { data: parsed.data, provider: hit.provider, model: hit.model, cached: true };
  }

  const errors: string[] = [];
  for (const provider of aiProviders()) {
    let retryNote: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = parseJson(await complete(provider, opts.system, opts.user, retryNote));
        const parsed = opts.schema.safeParse(raw);
        if (parsed.success) {
          db()
            .prepare("INSERT OR REPLACE INTO ai_cache (key, provider, model, response, created_at) VALUES (?, ?, ?, ?, ?)")
            .run(key, provider.name, provider.model, JSON.stringify(parsed.data), Date.now());
          return { data: parsed.data, provider: provider.name, model: provider.model, cached: false };
        }
        retryNote = `Your previous JSON did not match the required schema: ${parsed.error.message.slice(0, 500)}. Reply again with corrected JSON only.`;
        errors.push(`${provider.name}: schema mismatch`);
      } catch (err) {
        errors.push(`${provider.name}: ${(err as Error).message}`);
        break; // network / quota error: go to the next provider
      }
    }
  }
  throw new Error(`All AI providers failed. ${errors.join(" | ")}`);
}
