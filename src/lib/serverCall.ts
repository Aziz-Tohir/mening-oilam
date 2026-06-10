// Thin wrapper kept for backward compatibility with existing pages.
// Server functions are now plain async REST callers (see src/server/*.functions.ts).
// callServer(fn, payload) simply invokes fn(payload). The SWR cache below is unchanged.
import { useEffect, useRef, useState } from "react";

export async function callServer<T>(fn: (payload?: any) => Promise<T>, payload?: any): Promise<T> {
  return fn(payload);
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

export function useCachedServer<T>(
  key: string,
  fn: (payload?: any) => Promise<T>,
  payload?: any,
  opts: { staleMs?: number; enabled?: boolean } = {},
) {
  const { staleMs = 1_800_000, enabled = true } = opts;
  const initial = (() => {
    const m = memCache.get(key);
    if (m) return m;
    const s = readStore(key);
    if (s) memCache.set(key, s);
    return s;
  })();
  const [data, setData] = useState<T | null>(initial?.data ?? null);
  const [ts, setTs] = useState<number | null>(initial?.ts ?? null);
  const [loading, setLoading] = useState<boolean>(!initial);
  const [stale, setStale] = useState<boolean>(initial ? Date.now() - initial.ts >= staleMs : false);
  const [error, setError] = useState<Error | null>(null);
  const reqRef = useRef(0);

  const refetch = async (force = false) => {
    if (!enabled) return;
    const cached = memCache.get(key);
    if (!force && cached && Date.now() - cached.ts < staleMs) {
      setData(cached.data); setTs(cached.ts); setStale(false); setLoading(false);
      return cached.data;
    }
    if (cached) setStale(true);
    const myReq = ++reqRef.current;
    try {
      const res = await fn(payload);
      if (myReq !== reqRef.current) return res;
      const entry = { data: res, ts: Date.now() };
      memCache.set(key, entry);
      writeStore(key, entry);
      setData(res); setTs(entry.ts); setStale(false); setError(null);
      return res;
    } catch (e: any) {
      if (myReq !== reqRef.current) throw e;
      setError(e); throw e;
    } finally {
      if (myReq === reqRef.current) setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refetch(false).catch(() => {}); }, [key, enabled]);

  return { data, loading, error, ts, stale, refetch: () => refetch(true) };
}
