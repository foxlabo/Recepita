# syntax=docker/dockerfile:1
#
# Build context: repository root.
#   App image:        docker build -f recepita_azure_container_deploy/Dockerfile -t recepita .
#   Migration image:  docker build -f recepita_azure_container_deploy/Dockerfile --target migrate -t recepita-migrate .
#                     docker run --rm -e DATABASE_URL=... recepita-migrate

ARG NODE_IMAGE=node:22-alpine

# ---- deps: all dependencies (build + prisma CLI) ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# ---- builder: prisma generate + next build (standalone output) ----
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prisma.config.ts reads DATABASE_URL when loading; no connection is made at
# build time, so a placeholder is enough. No real secrets are baked in.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build

# ---- migrate: one-off job that applies Prisma migrations ----
FROM ${NODE_IMAGE} AS migrate
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

# ---- runner: minimal standalone server as a non-root user ----
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --chown=nextjs:nodejs --chmod=0555 recepita_azure_container_deploy/docker/startup.sh ./startup.sh

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/ping" >/dev/null || exit 1
CMD ["./startup.sh"]
