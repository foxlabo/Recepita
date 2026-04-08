# ---- base ----
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache python3 make g++ libc6-compat

# ---- deps（本番依存のみ）----
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- builder（devDepsも入れてbuild）----
FROM base AS builder
WORKDIR /app
# ★ NODE_ENV=development は絶対に置かない
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
# Prisma → Next build（常に production で）
RUN npx prisma generate && npm run build

# ---- runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1
# 依存物
COPY --from=deps /app/node_modules ./node_modules
# Next standalone 出力
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# 静的 / Prisma
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
# ヘルスチェック & 起動
HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/api/ping || exit 1
COPY recepita_azure_container_deploy/docker/startup.sh /app/startup.sh
RUN chmod +x /app/startup.sh
EXPOSE 3000
CMD ["/app/startup.sh"]

