import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

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

export function CacheStatus({
  ts,
  stale,
  loading,
  onRefresh,
}: {
  ts: number | null;
  stale?: boolean;
  loading?: boolean;
  onRefresh?: () => void | Promise<void>;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  if (!ts && !loading) {
    if (!onRefresh) return null;
    return (
      <button
        type="button"
        onClick={() => onRefresh()}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/50 transition"
        aria-label="Yangilash"
      >
        <RefreshCw className="h-3 w-3" />
        Yangilash
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-blue-500 animate-pulse" : stale ? "bg-amber-500" : "bg-emerald-500"}`} />
      {loading ? "yangilanmoqda…" : (
        <>
          {stale ? "keshdan" : "yangi"} · {ts ? formatRelative(ts) : "—"}
        </>
      )}
      {onRefresh && (
        <button
          type="button"
          onClick={() => onRefresh()}
          disabled={loading}
          className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-md hover:bg-muted/60 disabled:opacity-50 transition"
          aria-label="Yangilash"
          title="Yangilash"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      )}
    </span>
  );
}
