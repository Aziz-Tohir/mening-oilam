// Wrapper for calling server functions with user's auth bearer token.
// Includes a lightweight stale-while-revalidate cache (memory + sessionStorage)
// so repeat reads paint instantly while fresh data loads in the background.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export async function callServer<T>(fn: (input: any) => Promise<T>, payload?: any): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const origFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
    return origFetch(input, { ...init, headers });
  }) as typeof fetch;
  try {
    return await fn(payload === undefined ? undefined : { data: payload });
  } finally {
    globalThis.fetch = origFetch;
  }
}

// ---------- SWR cache ----------
const memCache = new Map<string, { data: any; ts: number }>();
const STORAGE_PREFIX = "swr:";

function readStore(key: string) {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeStore(key: string, value: { data: any; ts: number }) {
  try { sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)); } catch {}
}

export function invalidateCache(prefix?: string) {
  if (!prefix) { memCache.clear(); try { sessionStorage.clear(); } catch {} return; }
  for (const k of Array.from(memCache.keys())) if (k.startsWith(prefix)) memCache.delete(k);
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX + prefix)) sessionStorage.removeItem(k);
    }
  } catch {}
}

/**
 * useCachedServer — paints cached data immediately, refetches in the background.
 * @param key  unique cache key (include params, e.g. `events:${familyId}`)
 * @param fn   server function
 * @param payload  payload to pass
 * @param opts.staleMs  if cached data is fresher than this, skip network (default 30s)
 */
export function useCachedServer<T>(
  key: string,
  fn: (input: any) => Promise<T>,
  payload?: any,
  opts: { staleMs?: number; enabled?: boolean } = {},
) {
  const { staleMs = 30_000, enabled = true } = opts;
  const initial = (() => {
    const m = memCache.get(key);
    if (m) return m;
    const s = readStore(key);
    if (s) memCache.set(key, s);
    return s;
  })();
  const [data, setData] = useState<T | null>(initial?.data ?? null);
  const [loading, setLoading] = useState<boolean>(!initial);
  const [error, setError] = useState<Error | null>(null);
  const reqRef = useRef(0);

  const refetch = async (force = false) => {
    if (!enabled) return;
    const cached = memCache.get(key);
    if (!force && cached && Date.now() - cached.ts < staleMs) {
      setData(cached.data);
      setLoading(false);
      return cached.data;
    }
    const myReq = ++reqRef.current;
    try {
      const res = await callServer(fn, payload);
      if (myReq !== reqRef.current) return res;
      const entry = { data: res, ts: Date.now() };
      memCache.set(key, entry);
      writeStore(key, entry);
      setData(res);
      setError(null);
      return res;
    } catch (e: any) {
      if (myReq !== reqRef.current) throw e;
      setError(e);
      throw e;
    } finally {
      if (myReq === reqRef.current) setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void refetch(false); }, [key, enabled]);

  return { data, loading, error, refetch: () => refetch(true) };
}
