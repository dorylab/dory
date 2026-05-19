FROM node:24-bookworm AS installer
WORKDIR /app

# Install bun and enable corepack for yarn
RUN corepack enable \
 && npm install -g bun

ARG VERSION
ENV VERSION="${VERSION}" \
    CI=true \
    YARN_NODE_LINKER=node-modules \
    YARN_ENABLE_SCRIPTS=true

# Copy dependency files first for better caching (includes all workspaces)
COPY package.json yarn.lock ./
COPY apps/web/package.json ./apps/web/
COPY apps/electron/package.json ./apps/electron/
COPY apps/admin/package.json ./apps/admin/
COPY packages/analysis/package.json ./packages/analysis/
COPY packages/auth-core/package.json ./packages/auth-core/
COPY packages/database/package.json ./packages/database/
COPY packages/drivers/package.json ./packages/drivers/
COPY packages/files/package.json ./packages/files/
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/shared/package.json ./packages/shared/
COPY packages/web-utils/package.json ./packages/web-utils/

# Install dependencies (this layer is cached unless dependency files change)
RUN yarn install --immutable

# Copy source code
COPY . .

# Build application and bootstrap script
RUN yarn run build \
 && cd apps/web \
 && mkdir -p dist-scripts \
 && bun build scripts/bootstrap.ts --target=node --format=esm --outfile=dist-scripts/bootstrap.mjs \
 && cd /app \
 && cp -rn node_modules/@electric-sql/pglite/dist/. apps/web/dist-scripts/ \
 && cp node_modules/@electric-sql/pglite-legacy/dist/postgres.data apps/web/dist-scripts/ \
 && cp node_modules/@electric-sql/pglite-legacy/dist/postgres.wasm apps/web/dist-scripts/ \
 && rm -f apps/web/.next/standalone/.env apps/web/.next/standalone/.env.local

FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DORY_RUNTIME=docker \
    NEXT_PUBLIC_DORY_RUNTIME=docker

# tzdata
RUN apt-get update && apt-get install -y --no-install-recommends tzdata ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Use built-in node user for security
USER node

WORKDIR /app

COPY --from=installer --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=installer --chown=node:node /app/apps/web/public ./apps/web/public
COPY --from=installer --chown=node:node /app/apps/web/dist-scripts ./dist-scripts
COPY --from=installer --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000
CMD ["sh", "-c", "node dist-scripts/bootstrap.mjs && exec node apps/web/server.js"]
