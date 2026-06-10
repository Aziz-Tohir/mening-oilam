// This TanStack server route is superseded by the .NET backend.
// The frontend now calls the .NET API directly via src/lib/api.ts → miniAppAuth().
// This stub is kept only to avoid 404 if anything still routes through TanStack.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/telegram/miniapp-auth")({
  server: {
    handlers: {
      POST: async () => Response.json(
        { error: "moved", message: "Use the .NET backend API directly" },
        { status: 410 },
      ),
    },
  },
});
