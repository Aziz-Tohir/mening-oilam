// Superseded by the .NET backend: POST /api/bot-control/jobs/run/daily-reminders
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/daily-reminders")({
  server: {
    handlers: {
      GET: async () => Response.json({ error: "moved", message: "Use the .NET backend API directly" }, { status: 410 }),
      POST: async () => Response.json({ error: "moved", message: "Use the .NET backend API directly" }, { status: 410 }),
    },
  },
});
