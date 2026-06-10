// Superseded by the .NET backend's background polling service (JobRunner).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/telegram/poll")({
  server: {
    handlers: {
      GET: async () => Response.json({ error: "moved", message: "Use the .NET backend API directly" }, { status: 410 }),
      POST: async () => Response.json({ error: "moved", message: "Use the .NET backend API directly" }, { status: 410 }),
    },
  },
});
