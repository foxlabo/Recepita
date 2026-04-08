#!/usr/bin/env sh
set -e

# 保険：イメージに紛れ込んだ.envを消す
rm -f /app/.env /app/.env.* 2>/dev/null || true

echo "[startup] prisma migrate deploy..."
npx prisma migrate deploy

echo "[startup] next start on :${PORT:-3000}"
exec npx next start -p ${PORT:-3000}

