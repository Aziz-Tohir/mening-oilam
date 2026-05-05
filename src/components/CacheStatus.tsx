import { useEffect, useState } from "react";

function formatRelative(ts: number) {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "hozir";
  if (s < 60) return `${s} soniya oldin`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} daqiqa oldin`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} soat oldin`;
  return new Date(ts).toLocaleString("uz-UZ", { dateStyle: "short", timeStyle: "short" });
}

export function CacheStatus({ ts, stale, loading }: { ts: number | null; stale?: boolean; loading?: boolean }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  if (!ts && !loading) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-blue-500 animate-pulse" : stale ? "bg-amber-500" : "bg-emerald-500"}`} />
      {loading ? "yangilanmoqda…" : (
        <>
          {stale ? "keshdan" : "yangi"} · {ts ? formatRelative(ts) : "—"}
        </>
      )}
    </span>
  );
}
