// Daily sentiment analysis cron — runs ~02:00 UTC.
// Reads daily_message_buffer, calls Lovable AI Gateway to score each
// (family, member, day), writes aggregated sentiment_score to messages_stats,
// then DELETES the buffer rows. Raw text never persists past this run.
//
// Privacy guardrails:
//  - members with sentiment_opt_out=true are excluded at write-time (handler).
//  - members with < MIN_MSGS messages on a day are skipped (anonymity).
//  - buffer is deleted after analysis (or after 48h fail-safe).
//
// Auth: ?secret= or x-cron-secret header == process.env.CRON_SECRET.

import { createFileRoute } from "@tanstack/react-router";
import { getAdminDb } from "@/server/db.server";

const MIN_MSGS = 3;
const MODEL = "google/gemini-3-flash-preview";

type BufRow = {
  id: number;
  family_id: string;
  telegram_id: number;
  member_id: string | null;
  message_date: string;
  text: string;
};

async function scoreBatch(items: { telegram_id: number; texts: string[] }[]): Promise<Map<number, number>> {
  // Returns map telegram_id -> sentiment 0..1
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const lines = items.map(it =>
    `tg:${it.telegram_id}\n${it.texts.map(t => "- " + t.replace(/\s+/g, " ").slice(0, 400)).join("\n")}`
  ).join("\n\n");

  const body = {
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "Siz oilaviy chat xabarlarining ruhiy ohangini baholaysiz. Har bir foydalanuvchi (tg:<id>) uchun uning xabarlari to'plamini 0..1 oralig'ida baholang: 0 = juda xafa/g'azabli, 0.5 = neytral, 1 = juda quvonchli. Tilga qarab ajratmang (uz/ru/en/cyrl bir xil). Faqat funksiya orqali javob qaytaring.",
      },
      { role: "user", content: lines },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "report_scores",
          description: "Return sentiment scores for each user.",
          parameters: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    telegram_id: { type: "number" },
                    score: { type: "number", minimum: 0, maximum: 1 },
                  },
                  required: ["telegram_id", "score"],
                  additionalProperties: false,
                },
              },
            },
            required: ["items"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "report_scores" } },
  };

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`AI gateway ${r.status}: ${t.slice(0, 200)}`);
  }
  const j: any = await r.json();
  const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI: no tool_call arguments");
  const parsed = typeof args === "string" ? JSON.parse(args) : args;
  const out = new Map<number, number>();
  for (const it of parsed.items ?? []) {
    if (typeof it.telegram_id === "number" && typeof it.score === "number") {
      out.set(it.telegram_id, Math.max(0, Math.min(1, it.score)));
    }
  }
  return out;
}

async function processFamilyDay(db: ReturnType<typeof getAdminDb>, familyId: string, day: string, rows: BufRow[]) {
  // Group by telegram_id
  const byUser = new Map<number, { member_id: string | null; texts: string[] }>();
  for (const r of rows) {
    const cur = byUser.get(r.telegram_id) ?? { member_id: r.member_id, texts: [] };
    cur.texts.push(r.text);
    byUser.set(r.telegram_id, cur);
  }
  // Filter: min messages
  const eligible = [...byUser.entries()].filter(([, v]) => v.texts.length >= MIN_MSGS);
  if (!eligible.length) return 0;

  // Chunk to keep prompt size in check (10 users per call)
  const CHUNK = 10;
  const allScores = new Map<number, number>();
  for (let i = 0; i < eligible.length; i += CHUNK) {
    const slice = eligible.slice(i, i + CHUNK);
    const items = slice.map(([tg, v]) => ({ telegram_id: tg, texts: v.texts.slice(0, 80) }));
    try {
      const scores = await scoreBatch(items);
      scores.forEach((v, k) => allScores.set(k, v));
    } catch (e) {
      console.error("[sentiment] score failed", familyId, day, e);
      // Log to action_logs but continue with other chunks
      try {
        await db.from("action_logs").insert({
          family_id: familyId, action: "sentiment_ai_error",
          details: { day, error: String(e).slice(0, 300) },
        } as any);
      } catch { /* noop */ }
    }
  }

  // Write back: -1..1 normalized
  let updated = 0;
  for (const [tg, score01] of allScores) {
    const normalized = Number((score01 * 2 - 1).toFixed(3));
    const { error } = await db.from("messages_stats")
      .update({ sentiment_score: normalized, sentiment_analyzed_at: new Date().toISOString() } as any)
      .eq("family_id", familyId)
      .eq("telegram_id", tg)
      .eq("message_date", day)
      .is("sentiment_score", null);
    if (!error) updated += 1;
  }
  return updated;
}

async function handle(request: Request) {
  const url = new URL(request.url);
  let secret = url.searchParams.get("secret") ?? request.headers.get("x-cron-secret");
  if (!secret && request.method === "POST") {
    try {
      const body = await request.clone().json() as { secret?: string };
      secret = body?.secret ?? null;
    } catch { /* noop */ }
  }
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = getAdminDb();
  // Target: yesterday (UTC)
  const dayParam = url.searchParams.get("day");
  const target = dayParam ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  // Pull buffer rows for target day. Up to 5000 rows per run is safe for a cron.
  const { data: rows, error } = await db
    .from("daily_message_buffer")
    .select("id, family_id, telegram_id, member_id, message_date, text")
    .eq("message_date", target)
    .limit(5000);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Group by family
  const byFamily = new Map<string, BufRow[]>();
  for (const r of (rows ?? []) as BufRow[]) {
    const arr = byFamily.get(r.family_id) ?? [];
    arr.push(r);
    byFamily.set(r.family_id, arr);
  }

  let totalUpdated = 0;
  for (const [familyId, famRows] of byFamily) {
    try {
      totalUpdated += await processFamilyDay(db, familyId, target, famRows);
    } catch (e) {
      console.error("[sentiment] family failed", familyId, e);
    }
  }

  // Cleanup: delete processed day + fail-safe wipe of anything older than 2 days
  const cutoff = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  await db.from("daily_message_buffer").delete().lte("message_date", target);
  await db.from("daily_message_buffer").delete().lt("message_date", cutoff);

  return Response.json({
    ok: true,
    day: target,
    families: byFamily.size,
    rows: rows?.length ?? 0,
    updated: totalUpdated,
  });
}

export const Route = createFileRoute("/api/public/cron/sentiment-analysis")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
