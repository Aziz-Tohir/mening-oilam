# Mening Oilam — .NET 10 Backend

Fully independent backend that replaces the previous Supabase stack.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | .NET 10 / ASP.NET Core Minimal APIs |
| Database | PostgreSQL 17 + EF Core 10 + Npgsql 10 |
| Auth | JWT Bearer (HMAC-SHA256) + BCrypt + Refresh tokens |
| Telegram | Direct Bot API (`api.telegram.org`) — no gateway |
| Caching | HybridCache (.NET 10) |
| Jobs | Cronos-based BackgroundService (4 cron jobs) |
| AI Sentiment | Pluggable `ISentimentAnalyzer` (OpenAI-compatible / Null) |
| Storage | Local disk (`wwwroot/uploads`) / S3-ready |
| Compression | Brotli + Gzip response compression |

## Projects

```
MeningOilam.sln
├── src/MeningOilam.Domain          — Entities, enums (no external dependencies)
├── src/MeningOilam.Application     — DTOs, interfaces, business logic, kinship calculator
├── src/MeningOilam.Infrastructure  — EF Core DbContext, Telegram client, storage, AI, cache, auth
├── src/MeningOilam.Api             — ASP.NET Core Minimal API endpoints + BackgroundServices
└── tests/MeningOilam.Tests         — Unit tests (kinship, auth, moderation)
```

## Prerequisites

- .NET 10 SDK (`dotnet --version` → `10.x.x`)
- PostgreSQL 17 (or Docker)

## Quick Start (local)

### 1 — Database

```bash
# Option A: Docker
docker run -d --name moilam_pg \
  -e POSTGRES_DB=meningoilam \
  -e POSTGRES_USER=mouser \
  -e POSTGRES_PASSWORD=mopassword \
  -p 5432:5432 postgres:17-alpine

# Option B: existing PostgreSQL — create the DB manually
createdb meningoilam
```

### 2 — Configure

Copy and edit `src/MeningOilam.Api/appsettings.Development.json`:

```json
{
  "ConnectionStrings": {
    "Default": "Host=localhost;Port=5432;Database=meningoilam;Username=mouser;Password=mopassword"
  },
  "Jwt": {
    "Secret": "your-64-char-random-secret-here",
    "Issuer": "MeningOilam",
    "Audience": "MeningOilamClient"
  },
  "Telegram": {
    "BotToken": "YOUR_BOT_TOKEN_HERE",
    "BotUsername": "your_bot_username"
  },
  "Seed": {
    "SuperadminEmail": "admin@example.com",
    "SuperadminPassword": "Admin123!"
  }
}
```

Key settings in `appsettings.json`:

| Section | Key | Description |
|---|---|---|
| `ConnectionStrings` | `Default` | PostgreSQL connection string |
| `Jwt` | `Secret` | ≥32-char HMAC key for JWT signing |
| `Telegram` | `BotToken` | Bot token from @BotFather |
| `Telegram` | `Mode` | `LongPoll` (default) or `Webhook` |
| `Ai` | `Endpoint` | OpenAI-compatible URL (null = disabled) |
| `Storage` | `Provider` | `Local` (default) |
| `Cors` | `AllowedOrigins` | Frontend origins |
| `Seed` | `SuperadminEmail` | Initial superadmin credentials |

### 3 — Run (applies EF migrations automatically on startup)

```bash
cd backend
dotnet run --project src/MeningOilam.Api
```

API available at: `http://localhost:5080`
Swagger UI (dev): `http://localhost:5080/scalar`
Health check: `http://localhost:5080/health`

### 4 — Tests

```bash
cd backend
dotnet test
```

## Docker Compose (full stack)

From the repository root:

```bash
# Set required env vars
export TELEGRAM_BOT_TOKEN=123456:ABC...
export TELEGRAM_BOT_USERNAME=your_bot
export SUPERADMIN_EMAIL=admin@example.com
export SUPERADMIN_PASSWORD=Admin123!
export FRONTEND_URL=http://localhost:3000

docker compose up --build
```

Services:
- `postgres` → port 5432
- `api` → port 5080

## EF Migrations

```bash
cd backend

# Generate a new migration
$env:CONNECTION_STRING="Host=localhost;Port=5432;Database=meningoilam;Username=mouser;Password=mopassword"
dotnet ef migrations add <MigrationName> \
  --project src/MeningOilam.Infrastructure \
  --startup-project src/MeningOilam.Api

# Apply migrations manually (also runs automatically on startup)
dotnet ef database update \
  --project src/MeningOilam.Infrastructure \
  --startup-project src/MeningOilam.Api
```

## API Overview

| Group | Endpoints |
|---|---|
| Auth | `POST /api/auth/register` `login` `refresh` `logout` `GET /api/auth/me` |
| Families | `GET/POST /api/families` · stats · invite · regenerate · export |
| Members | `GET/POST/PATCH/DELETE /api/families/{id}/members` |
| Relationships | `GET/POST/DELETE /api/families/{id}/relationships` |
| Kinship | `GET /api/families/{id}/kinship?fromMemberId=&toMemberId=` |
| Events | `GET/POST/PATCH/DELETE /api/families/{id}/events` · birthdays |
| Stats | `/api/families/{id}/stats/messages` · sentiment |
| Awards | nominations · memories |
| Bot | banned-words · warnings · moderate · broadcast · broadcasts · integrations |
| Settings | `GET/PATCH /api/families/{id}/settings` |
| Logs | `GET /api/families/{id}/logs` |
| Admin | `/api/admin/families` (superadmin) · telegram-updates |
| Bot Control | `/api/bot-control/*` (status, start/stop polling, webhook, test-send, run-job) |
| Files | `POST /api/files/avatar` |
| Profile | `/api/profile/memberships` · `PATCH /api/profile/members/{id}` · import-telegram-photo |
| Public | `POST /api/public/telegram/miniapp-auth` · miniapp-register · webhook |

## Bot Commands

| Command | Description |
|---|---|
| `/start` | Registration wizard or welcome message |
| `/link` | Link Telegram account to family |
| `/kim @user` | Show kinship relation |
| `/yordam` | Help message |
| `/privacy` | Privacy settings |
| `/reset` | Reset bot session |

## Cron Jobs

| Job | Default schedule | Description |
|---|---|---|
| `daily-reminders` | `0 8 * * *` | Birthday and event reminders |
| `process-join-requests` | `*/5 * * * *` | Auto-expire old join requests |
| `sentiment-analysis` | `0 3 * * *` | Batch sentiment scoring |
| `annual-awards` | `0 0 1 1 *` | Year-end nominations |

All jobs can be triggered manually from the Admin → Bot Control panel.
