FROM node:22-alpine AS installer
WORKDIR /app

RUN corepack enable \
 && corepack prepare yarn@1.22.22 --activate
COPY . .

ARG VERSION
ENV VERSION="${VERSION}"
ENV CI=true

RUN apk add --no-cache curl bash
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN yarn install --frozen-lockfile
RUN yarn run build
RUN mkdir -p apps/web/dist-scripts \
 && bun build apps/web/scripts/bootstrap.ts --target=node --format=esm --outfile=apps/web/dist-scripts/bootstrap.mjs

# copy pglite runtime assets next to bootstrap.mjs
RUN DIST="$(find apps/web -path '*/@electric-sql/pglite*/dist' -type d -print -quit)" \
 && [ -n "$DIST" ] \
 && cp -a "$DIST"/postgres.* apps/web/dist-scripts/ \
 && cp -a "$DIST"/*.wasm apps/web/dist-scripts/ \
 && ls -lah apps/web/dist-scripts | sed -n '1,120p'
 
RUN rm -f apps/web/.next/standalone/.env apps/web/.next/standalone/.env.local
RUN yarn install --production --frozen-lockfile

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# tzdata
RUN apk add --no-cache tzdata ca-certificates

RUN addgroup -S -g 1001 nodejs \
 && adduser -S -u 1001 -G nodejs nextjs \
 && mkdir -p /app/logs /app/data \
 && chown -R nextjs:nodejs /app

USER nextjs

COPY --from=installer /app/apps/web/package.json .
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/standalone/node_modules ./node_modules
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/standalone/apps/web/server.js ./apps/web/server.js
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/standalone/apps/web/node_modules ./apps/web/node_modules
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/standalone/apps/web/.next ./apps/web/.next
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/dist-scripts ./dist-scripts
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static


EXPOSE 3000
CMD ["sh", "-lc", "node dist-scripts/bootstrap.mjs && node apps/web/server.js"]
