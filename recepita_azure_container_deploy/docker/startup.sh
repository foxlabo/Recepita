#!/bin/sh
set -e

# Run migrations at startup only when the Prisma CLI is present in the image.
# The default image (Next.js standalone output) does not ship it; apply
# migrations as a separate step instead (see README_DEPLOY.md, "migrate" target).
if [ -x ./node_modules/.bin/prisma ]; then
  echo "[startup] prisma migrate deploy"
  ./node_modules/.bin/prisma migrate deploy
else
  echo "[startup] Prisma CLI not in image; skipping migrations (run the 'migrate' image separately)"
fi

echo "[startup] node server.js on :${PORT:-3000}"
exec node server.js
