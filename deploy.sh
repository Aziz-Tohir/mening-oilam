#!/usr/bin/env bash
# =============================================================================
#  Mening Oilam — bitta buyruq bilan to'liq production deploy (Ubuntu/Debian)
# -----------------------------------------------------------------------------
#  Nima qiladi:
#   1. Kerakli paketlarni o'rnatadi: Docker + Compose, Node 20, nginx, certbot
#   2. Sirlarni (.env.deploy) yaratadi/o'qiydi — JWT, DB parol, cron secret avto
#   3. postgres + .NET API (+ ixtiyoriy cobalt) ni Docker'da ko'taradi
#   4. Frontend'ni statik (SPA) qilib quradi
#   5. nginx'ni o'zi sozlaydi: SPA + /api reverse proxy + /uploads
#   6. certbot orqali HTTPS (Let's Encrypt) ni avtomatik yoqadi
#
#  Ishlatish:
#     sudo ./deploy.sh
#  Qayta ishga tushirsa — idempotent (xavfsiz qayta yangilaydi).
# =============================================================================
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$REPO/.env.deploy"
log()  { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "root kerak — 'sudo ./deploy.sh' deb ishga tushiring."
command -v apt-get >/dev/null || die "Bu skript Ubuntu/Debian (apt) uchun."

# ---------------------------------------------------------------------------
# 1) Konfiguratsiya — .env.deploy
# ---------------------------------------------------------------------------
gen() { openssl rand -hex 32; }

if [ ! -f "$ENV_FILE" ]; then
  log "Birinchi ishga tushish — sozlamalar so'raladi (.env.deploy yaratiladi)"
  read -rp "  Domen (masalan: oilam.example.com): " DOMAIN
  [ -n "${DOMAIN:-}" ] || die "Domen majburiy."
  read -rp "  Let's Encrypt uchun email: " LE_EMAIL
  read -rp "  Telegram bot token (@BotFather): " TG_TOKEN
  read -rp "  Telegram bot username (@'siz): " TG_USERNAME
  read -rp "  Superadmin email [admin@${DOMAIN}]: " SA_EMAIL
  SA_EMAIL="${SA_EMAIL:-admin@${DOMAIN}}"
  read -rp "  Superadmin parol [avto-generatsiya]: " SA_PASS
  SA_PASS="${SA_PASS:-$(openssl rand -base64 12)A1!}"
  read -rp "  cobalt'ni yoqaymi (toza video yuklash)? [y/N]: " WANT_COBALT

  cat > "$ENV_FILE" <<EOF
# Avtomatik yaratildi. Maxfiy — git'ga qo'shmang!
DOMAIN="$DOMAIN"
LE_EMAIL="$LE_EMAIL"
TG_TOKEN="$TG_TOKEN"
TG_USERNAME="$TG_USERNAME"
SA_EMAIL="$SA_EMAIL"
SA_PASS="$SA_PASS"
DB_PASSWORD="$(gen)"
JWT_SECRET="$(gen)$(gen)"
CRON_SECRET="$(gen)"
COBALT_ENABLE="$([ "${WANT_COBALT,,}" = "y" ] && echo yes || echo no)"
COBALT_BASE_URL="http://cobalt:9000"
# Postgres host'ga CHIQARILMAYDI (bo'sh = ichki Docker tarmog'i, konflikt yo'q).
# Agar host'dan DB'ga ulanmoqchi bo'lsangiz, bo'sh portni yozing (masalan 5434).
DB_HOST_PORT=""
EOF
  chmod 600 "$ENV_FILE"
  ok ".env.deploy yaratildi (keyingi safar so'ralmaydi)"
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

# ---------------------------------------------------------------------------
# 2) Kerakli paketlar
# ---------------------------------------------------------------------------
log "Tizim paketlari tekshirilmoqda..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

if ! command -v docker >/dev/null; then
  log "Docker o'rnatilmoqda..."
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || apt-get install -y -qq docker-compose-plugin

# TanStack Start Node >=22.12 talab qiladi
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  log "Node.js 22 o'rnatilmoqda..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

command -v nginx   >/dev/null || { log "nginx o'rnatilmoqda...";   apt-get install -y -qq nginx; }
command -v certbot >/dev/null || { log "certbot o'rnatilmoqda..."; apt-get install -y -qq certbot python3-certbot-nginx; }
command -v openssl >/dev/null || apt-get install -y -qq openssl
ok "Paketlar tayyor."

# ---------------------------------------------------------------------------
# 3) docker-compose.prod.yml — postgres + api (+ cobalt)
# ---------------------------------------------------------------------------
log "docker-compose.prod.yml yaratilmoqda..."
COBALT_SVC=""
COBALT_DEP=""
COBALT_ENV_BASE='""'
if [ "${COBALT_ENABLE:-no}" = "yes" ]; then
  COBALT_ENV_BASE="\"$COBALT_BASE_URL\""
  COBALT_DEP=$'\n      cobalt:\n        condition: service_started'
  COBALT_SVC=$(cat <<'YAML'

  cobalt:
    image: ghcr.io/imputnet/cobalt:10
    container_name: mening_oilam_cobalt
    restart: unless-stopped
    environment:
      API_URL: "http://cobalt:9000/"
    expose:
      - "9000"
YAML
)
fi

# Postgres host porti — faqat DB_HOST_PORT belgilangan bo'lsa chiqariladi (aks holda ichki).
PG_PORTS=""
if [ -n "${DB_HOST_PORT:-}" ]; then
  PG_PORTS=$'\n    ports:\n      - "127.0.0.1:'"$DB_HOST_PORT"$':5432"'
fi

cat > "$REPO/docker-compose.prod.yml" <<EOF
services:
  postgres:
    image: postgres:17-alpine
    container_name: mening_oilam_db
    restart: unless-stopped
    environment:
      POSTGRES_DB: meningoilam
      POSTGRES_USER: mouser
      POSTGRES_PASSWORD: "$DB_PASSWORD"
    volumes:
      - pgdata:/var/lib/postgresql/data$PG_PORTS
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mouser -d meningoilam"]
      interval: 5s
      timeout: 5s
      retries: 12

  api:
    build:
      context: ./backend
      dockerfile: src/MeningOilam.Api/Dockerfile
    container_name: mening_oilam_api
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy$COBALT_DEP
    environment:
      ASPNETCORE_ENVIRONMENT: Production
      ASPNETCORE_URLS: "http://+:5080"
      ConnectionStrings__Postgres: "Host=postgres;Port=5432;Database=meningoilam;Username=mouser;Password=$DB_PASSWORD;Pooling=true;Maximum Pool Size=40"
      Jwt__Secret: "$JWT_SECRET"
      Jwt__Issuer: "MeningOilam"
      Jwt__Audience: "MeningOilamClient"
      Telegram__BotToken: "$TG_TOKEN"
      Telegram__BotUsername: "$TG_USERNAME"
      Telegram__Mode: "polling"
      Cron__Secret: "$CRON_SECRET"
      Cobalt__BaseUrl: $COBALT_ENV_BASE
      Cors__AllowedOrigins__0: "https://$DOMAIN"
      Seed__SuperadminEmail: "$SA_EMAIL"
      Seed__SuperadminPassword: "$SA_PASS"
    ports:
      - "127.0.0.1:5080:5080"
    volumes:
      - uploads:/app/wwwroot/uploads
$COBALT_SVC
volumes:
  pgdata:
  uploads:
EOF
ok "Compose fayli tayyor."

log "Backend + DB ko'tarilmoqda (birinchi build biroz vaqt oladi)..."
docker compose -f "$REPO/docker-compose.prod.yml" up -d --build
ok "Konteynerlar ishga tushdi (migration startup'da avtomatik qo'llanadi)."

# ---------------------------------------------------------------------------
# 4) Frontend statik build
# ---------------------------------------------------------------------------
log "Frontend qurilmoqda (VITE_API_URL=https://$DOMAIN)..."
cd "$REPO"
# npm ci qat'iy (lock sinxron bo'lishini talab qiladi); drift bo'lsa npm install'ga o'tamiz.
npm ci --no-audit --no-fund || { log "lock fayl sinxron emas — npm install bilan davom etiladi"; npm install --no-audit --no-fund; }
VITE_API_URL="https://$DOMAIN" npm run build

FRONT_DIR=""
for d in dist dist/client .output/public build; do
  [ -f "$REPO/$d/index.html" ] && { FRONT_DIR="$REPO/$d"; break; }
done
[ -n "$FRONT_DIR" ] || die "Build chiqishi topilmadi (index.html). 'npm run build' loglarini tekshiring."
ok "Frontend tayyor: $FRONT_DIR"

# ---------------------------------------------------------------------------
# 5) nginx — SPA + reverse proxy
# ---------------------------------------------------------------------------
log "nginx sozlanmoqda..."
NGINX_CONF="/etc/nginx/sites-available/meningoilam.conf"
cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    root $FRONT_DIR;
    index index.html;

    client_max_body_size 60m;
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    # .NET API
    location /api/ {
        proxy_pass http://127.0.0.1:5080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }

    # Yuklangan fayllar (avatar va h.k.)
    location /uploads/ {
        proxy_pass http://127.0.0.1:5080;
        proxy_set_header Host \$host;
    }

    location = /health {
        proxy_pass http://127.0.0.1:5080;
    }

    # Statik aktivlar — uzoq cache
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    # SPA fallback
    location / {
        try_files \$uri /index.html;
    }
}
EOF

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/meningoilam.conf
[ -f /etc/nginx/sites-enabled/default ] && rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
ok "nginx HTTP sozlandi."

# ---------------------------------------------------------------------------
# 6) HTTPS — Let's Encrypt (certbot nginx'ni o'zi tahrirlaydi)
# ---------------------------------------------------------------------------
if [ -n "${LE_EMAIL:-}" ]; then
  log "HTTPS sertifikati olinmoqda (certbot)..."
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$LE_EMAIL" --redirect; then
    ok "HTTPS yoqildi va avtomatik yangilanish sozlandi."
  else
    printf '\033[1;33m! certbot bajarilmadi — domen DNS A-yozuvi shu serverga yo\x27naltirilganini tekshiring, keyin qayta ishga tushiring.\033[0m\n'
  fi
else
  printf '\033[1;33m! LE_EMAIL bo\x27sh — HTTPS o\x27tkazib yuborildi. Faqat HTTP ishlaydi.\033[0m\n'
fi

# ---------------------------------------------------------------------------
# Yakun
# ---------------------------------------------------------------------------
cat <<EOF

$(ok "DEPLOY TUGADI")
  🌐 Sayt:        https://$DOMAIN
  🔌 API:         https://$DOMAIN/api
  👤 Superadmin:  $SA_EMAIL  /  (parol .env.deploy ichida)
  🤖 Bot:         polling rejimida (webhook shart emas)
  🎬 cobalt:      ${COBALT_ENABLE}

  Foydali buyruqlar:
    docker compose -f docker-compose.prod.yml logs -f api     # API loglari
    docker compose -f docker-compose.prod.yml ps              # holat
    sudo ./deploy.sh                                          # qayta deploy/yangilash
EOF
