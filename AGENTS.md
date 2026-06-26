# AGENTS.md

## Overview

This repository is a Yarn workspace monorepo for Dory.

- `apps/web`: main product application
- `apps/admin`: admin application
- `apps/electron`: Electron wrapper for the web app
- `packages/auth-core`: shared auth package

Most product work happens in `apps/web`.

## Product Model

The product has two runtime forms:

- Desktop
- Web self-hosting

These are runtime variants of the same `apps/web` application, not two separate frontends.

- Runtime is determined by `DORY_RUNTIME` and `NEXT_PUBLIC_DORY_RUNTIME`
- Do not scatter direct runtime env checks in feature code
- Use `apps/web/lib/runtime/runtime.ts` as the runtime helper layer
- Direct runtime env reads are only allowed inside the runtime helper layer or boot/injection code such as Electron startup

## Core Source Areas

Treat these as the primary source of truth:

- `apps/web/app`
- `apps/web/components`
- `apps/web/lib`
- `apps/web/lib/database`
- `apps/web/lib/database/postgres/schemas`
- `apps/web/lib/database/postgres/impl`
- `apps/web/lib/connection/drivers`
- `apps/web/lib/utils/ensure-connection.ts`
- `apps/web/hooks`
- `apps/web/shared`
- `apps/admin/app`
- `apps/admin/lib`
- `apps/electron/main`
- `packages/i18n/src`
- `packages/auth-core/src`
- `tests/e2e`

Avoid editing generated or local artifact paths unless the task explicitly targets them:

- `**/.next/**`
- `**/node_modules/**`
- `apps/web/dist-scripts`
- `apps/web/release`
- `apps/web/.tmp`
- `apps/web/localdata`
- `apps/electron/dist`
- `apps/electron/dist-electron`
- `apps/electron/dist/mac-arm64`
- `playwright-report`
- `test-results`

## Commands

Run from the repository root unless workspace-local execution is more appropriate.

- `yarn`
- `yarn dev`
- `yarn admin:dev`
- `yarn electron:dev`
- `yarn build`
- `yarn admin:build`
- `yarn electron:build`
- `yarn lint`
- `yarn typecheck`
- `yarn format:check`
- `yarn format:write`
- `yarn test:e2e`

Useful workspace commands:

- `yarn workspace web run lint`
- `yarn workspace web run typecheck`
- `yarn workspace admin run lint`
- `yarn workspace admin run typecheck`

## Coding Rules

- Make minimal, targeted changes
- Preserve existing structure and naming
- Follow the repository formatter: 4 spaces, semicolons, single quotes, trailing commas
- Keep imports aligned with the existing Prettier import sorting rules
- Use strict TypeScript patterns; do not weaken types to force builds through
- In `apps/web`, prefer the existing `@/*` alias where helpful
- For client-side HTTP requests, cacheable server state, loading/error state, invalidation, polling, refresh, or request de-duplication, prefer `@tanstack/react-query` over hand-rolled `useEffect` fetch logic, local component caches, or module-level `Map` caches
- For URL-backed client state in `apps/web`, use `nuqs` (`useQueryState` / `useQueryStates` and shared parsers) instead of hand-rolled `URLSearchParams`, `useSearchParams`, or manual `router.push/replace` query updates.
- UI work must use the existing theme system and component styling conventions
- Do not create one-off visual systems, isolated color tokens, or theme logic that bypasses the current theme infrastructure
- Reuse the existing theme providers, theme tokens, and themed components in `apps/web/app/themes.css`, `apps/web/app/globals.css`, and `apps/web/components/*` when building UI
- If a new UI pattern needs theme support, extend the existing theme system instead of generating an unthemed or separately themed implementation

## Database Rules

Dory is a multi-database product. The app's own persistence layer lives in `apps/web/lib/database`.

- Application storage currently supports `pglite` and `postgres`
- Shared application schema definitions live in `apps/web/lib/database/postgres/schemas`
- Application persistence implementations live in `apps/web/lib/database/postgres/impl`
- Keep schema definition separate from query and persistence logic
- Extend the database layer instead of placing persistence logic in routes or unrelated modules
- If a route needs new persistence behavior, add it in the database layer first and call that abstraction from the route
- New route code must not import low-level DB primitives for app persistence, including `drizzle-orm`, raw schema tables, or direct DB clients
- Existing direct DB access in routes should be treated as legacy code to reduce over time, not as a pattern to copy

## Connection Rules

Multi-connection support lives under `apps/web/lib/connection/drivers`.

- All driver-specific connection implementations should live in this directory tree
- If a new database driver or connection capability is added, implement it in the connection layer, not in routes or pages
- API routes under `apps/web/app/api` should use `ensureConnection` from `apps/web/lib/utils/ensure-connection.ts` as the standard entrypoint
- Do not duplicate connection-id parsing, team scoping, or pool lookup in routes when `ensureConnection` covers the use case
- If `ensureConnection` is insufficient, extend the helper or connection layer first, then update the route

## Route Rules

Apply these rules to `apps/web/app/api/**/route.ts`.

Routes are thin transport layers only.

Routes may do:

- request parsing
- lightweight validation
- auth or team-context resolution
- `ensureConnection` for connection-backed APIs
- delegation to `lib/database`, `lib/connection`, or `lib/server`
- response shaping and status handling

Routes should not do:

- direct application persistence logic
- driver-specific connection implementation
- repeated runtime detection logic
- repeated connection resolution logic
- large business workflows that belong in `lib/*`

Preferred route flow:

1. Parse and validate input.
2. Resolve auth or team context.
3. Call `ensureConnection(req, ...)` when the route is connection-backed.
4. Delegate:
   - `lib/database/*` for app persistence
   - `lib/connection/*` for external datasource behavior
   - `lib/server/*` for server orchestration
5. Return the HTTP response.

## App Notes

### `apps/web`

- Desktop and Web self-hosting both use this app
- The app uses Next.js App Router
- Database and migration scripts live here
- Use `apps/web/lib/database` for app persistence
- Use `ensureConnection` for connection-backed APIs
- UI should stay inside the existing theme system; do not ship pages or components that visually bypass the current themed component stack
- Check `apps/web/.env.example` when adding env-dependent behavior
- Shared i18n message JSON lives in `packages/i18n/src/locales`; do not recreate `apps/web/public/locales`.

### `apps/admin`

- Runs independently on port `3001`
- Keep admin-specific logic isolated unless sharing is clearly justified

### `apps/electron`

- Packages the shared web app
- Sets `DORY_RUNTIME=desktop` and `NEXT_PUBLIC_DORY_RUNTIME=desktop`
- If Electron packaging or startup changes, verify the matching `apps/web` assumptions

## Verification

Prefer the narrowest useful verification for the touched area.

- UI or feature work: lint or typecheck the affected workspace at minimum
- UI work should be checked against the existing theme system instead of introducing isolated styles that ignore current theme behavior
- Auth, login, or workbench changes: consider relevant Playwright coverage in `tests/e2e`
- Migration, schema, provider, or local DB changes: validate the database-layer path, not only the route
- Connection-driver or `ensureConnection` changes: verify the affected API behavior through the shared entrypoint
- Runtime-sensitive changes: verify the intended runtime variant instead of assuming Desktop and self-hosting behave the same

When runtime-sensitive code changes:

- consider both Desktop and Web self-hosting
- update the shared runtime helper instead of adding one-off checks
- inspect Electron startup if runtime injection assumptions changed

When persistence changes:

- keep routes thin
- update schema definitions first if the model changes
- check whether both `pglite` and `postgres` need matching changes

When connection-backed API changes:

- keep driver logic in `apps/web/lib/connection/drivers`
- use `ensureConnection` as the route entrypoint
- extend shared abstractions before adding route-local connection logic

## Handoff Expectations

In the final handoff, state:

- what changed
- what was verified
- which runtime assumptions were considered when relevant
- any remaining risks or unverified paths

<!-- BEGIN:nextjs-agent-rules -->
 
# Next.js: ALWAYS read docs before coding
 
Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.
 
<!-- END:nextjs-agent-rules -->
