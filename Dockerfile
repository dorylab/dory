FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS builder

# Install native build dependencies (for better-sqlite3 etc.)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests first for better layer caching
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/electron/package.json apps/electron/package.json
COPY packages/auth-core/package.json packages/auth-core/package.json

ENV CI=true
RUN bun install --frozen-lockfile

# Copy source code after dependencies are installed
COPY . .

ARG VERSION
ENV VERSION="${VERSION}"

# build includes bootstrap bundle and pglite asset copying
RUN bun run build

RUN rm -f apps/web/.next/standalone/.env apps/web/.next/standalone/.env.local

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DORY_RUNTIME=docker
ENV NEXT_PUBLIC_DORY_RUNTIME=docker
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN apt-get update && apt-get install -y --no-install-recommends tzdata ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app/logs /app/data \
 && chown -R bun:bun /app

USER bun

COPY --from=builder --chown=bun:bun /app/apps/web/package.json .
COPY --from=builder --chown=bun:bun /app/apps/web/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=bun:bun /app/apps/web/dist-scripts ./dist-scripts
COPY --from=builder --chown=bun:bun /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000
CMD ["sh", "-c", "bun dist-scripts/bootstrap.mjs && bun apps/web/server.js"]
