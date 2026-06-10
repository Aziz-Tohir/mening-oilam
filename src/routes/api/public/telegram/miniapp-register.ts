// Superseded by the .NET backend: POST /api/public/telegram/miniapp-register
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/telegram/miniapp-register")({
  server: {
    handlers: {
      POST: async () => Response.json(
        { error: "moved", message: "Use the .NET backend API directly" },
        { status: 410 },
      ),
    },
  },
});
