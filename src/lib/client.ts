"use client";

import { useCallback, useEffect, useState } from "react";

export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

// Fetch on mount and every `intervalMs`; `reload` refreshes immediately.
export function usePoll<T>(url: string | null, intervalMs = 4000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!url) return;
    try {
      setData(await api<T>(url));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [url]);

  useEffect(() => {
    if (!url) return;
    const first = setTimeout(reload, 0);
    const timer = setInterval(reload, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [url, intervalMs, reload]);

  return { data, error, reload };
}

export const money = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const pct = (rate: number, digits = 2) => `${(rate * 100).toFixed(digits)}%`;
