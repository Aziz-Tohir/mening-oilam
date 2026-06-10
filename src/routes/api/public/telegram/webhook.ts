// Superseded by the .NET backend: POST /api/public/telegram/webhook
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async () => Response.json(
        { error: "moved", message: "Use the .NET backend API directly" },
        { status: 410 },
      ),
    },
  },
});
