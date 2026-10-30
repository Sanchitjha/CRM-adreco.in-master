FROM node:22-alpine AS base
# Prisma's query engine links against OpenSSL, which the Alpine base image does not ship.
RUN apk add --no-cache openssl
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# One-off image for database work: `docker build --target migrator`, then run it with the production DATABASE_URL.
# It keeps the Prisma CLI and seed tooling that the slim runtime image below leaves out.
#   migrate:  docker run --rm --env-file .env adreco-crm-migrator
#   first seed (admin only):  docker run --rm --env-file .env -e SEED_MODE=production -e SEED_ADMIN_PASSWORD=... adreco-crm-migrator npm run db:seed
FROM builder AS migrator
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS runner
# HOSTNAME: Docker sets it to the container id, which would bind the server to one interface only and fail the
# health check below, so listen on every interface. TZ: calendar dates, "due today" and greetings are Indian local
# time wherever the container runs.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Kolkata
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
