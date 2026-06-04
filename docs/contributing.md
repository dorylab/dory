# Contributing to Dory

Thanks for your interest in contributing to Dory.

This repository is a Yarn workspace monorepo. Most product work happens in `apps/web`, with supporting applications in `apps/admin` and `apps/electron`.

## Before You Start

- Use Node 24.x and the Yarn version compatible with the repository's `packageManager` setting.
- `better-sqlite3` is installed from prebuilt binaries for Node 24 in this repo. If you switch Node majors, reinstall dependencies under Node 24 instead of trying to rebuild the module manually.
- Install dependencies from the repository root:

```bash
yarn install
yarn
```

- If you are changing Next.js behavior in `apps/web`, read the relevant docs in `node_modules/next/dist/docs/` first. In this repository, those local docs are the source of truth.

## Repository Structure

- `apps/web`: main product application
- `apps/admin`: admin application
- `apps/electron`: Electron wrapper for the web app
- `packages/auth-core`: shared auth package
- `tests/e2e`: end-to-end tests
- `docs`: project documentation

Primary source areas:

- `apps/web/app`
- `apps/web/components`
- `apps/web/lib`
- `apps/web/hooks`
- `apps/web/shared`
- `packages/i18n/src`
- `apps/admin/app`
- `apps/admin/lib`
- `apps/electron/main`
- `packages/auth-core/src`

Avoid editing generated or local artifact paths unless your change explicitly targets them, such as `.next`, `node_modules`, packaged Electron output, or Playwright reports.

## Local Development

Run commands from the repository root unless a workspace-local command is more appropriate.

For application persistence, Dory uses `pglite` for local development and for the Desktop runtime. In practice, that means many contributor workflows will use the local `pglite` application database unless you explicitly configure `postgres`.

Common commands:

```bash
yarn dev
yarn admin:dev
yarn electron:dev
yarn build
yarn lint
yarn typecheck
yarn format:check
yarn format:write
yarn test:e2e
```

Useful workspace-specific commands:

```bash
yarn workspace web run lint
yarn workspace web run typecheck
yarn workspace admin run lint
yarn workspace admin run typecheck
```

Useful `pglite`-related commands:

```bash
yarn pglite:studio
yarn pglite:migrate:generate
yarn pglite:migrate:compile
```

## Contribution Guidelines

- Keep changes minimal and targeted.
- Preserve existing structure, naming, and patterns.
- Follow the repository formatter:
  - 4 spaces
  - semicolons
  - single quotes
  - trailing commas
- Use strict TypeScript patterns. Do not weaken types to force builds through.
- In `apps/web`, prefer the existing `@/*` alias where it helps readability.
- Shared locale JSON for the web app lives in `packages/i18n/src/locales`; do not add or regenerate `apps/web/public/locales`.

## Runtime Rules

Dory has two runtime variants built from the same `apps/web` app:

- Desktop
- Web self-hosting

When working with runtime-sensitive code:

- Use `apps/web/lib/runtime/runtime.ts` as the runtime helper layer.
- Do not scatter direct `DORY_RUNTIME` or `NEXT_PUBLIC_DORY_RUNTIME` checks in feature code.
- Keep direct runtime env reads limited to runtime helpers or boot/injection code such as Electron startup.

## API, Database, and Connection Rules

For `apps/web/app/api/**/route.ts`:

- Keep routes thin.
- Routes should parse requests, validate lightly, resolve auth or team context, delegate to shared libraries, and return responses.
- Do not place application persistence logic, driver-specific connection logic, or large business workflows directly in routes.

For persistence work:

- Use `apps/web/lib/database` for application storage changes.
- Remember that `pglite` is the default application database for local development and the Desktop runtime, while `postgres` is also supported for application persistence.
- Keep shared schema definitions in `apps/web/lib/database/postgres/schemas`.
- Keep persistence implementations in `apps/web/lib/database/postgres/impl`.
- If a route needs new persistence behavior, add it in the database layer first and call that abstraction from the route.

For connection-backed APIs:

- Keep driver-specific logic under `apps/web/lib/connection/drivers`.
- Use `ensureConnection` from `apps/web/lib/utils/ensure-connection.ts` as the route entrypoint.
- Extend shared abstractions before adding route-local connection logic.

## UI Guidelines

- Reuse the existing theme system and component styling conventions.
- Do not introduce one-off visual systems or isolated theme logic.
- If new UI needs theme support, extend the current theme infrastructure instead of bypassing it.

## Verification

Choose the narrowest useful verification for the area you changed.

- UI or feature work: run lint or typecheck for the affected workspace at minimum.
- Auth, login, or workbench changes: consider relevant Playwright coverage in `tests/e2e`.
- Migration or schema changes: verify the database-layer path, not only the route.
- Connection-driver or `ensureConnection` changes: verify the affected API behavior through the shared entrypoint.
- Runtime-sensitive changes: consider both Desktop and Web self-hosting.

Examples:

```bash
yarn workspace web run lint
yarn workspace web run typecheck
yarn workspace admin run lint
yarn workspace admin run typecheck
yarn test:e2e
```

## Pull Requests

When opening a pull request:

- Explain what changed and why.
- Mention what you verified.
- Call out runtime assumptions when relevant.
- Note any remaining risks or unverified paths.

Small, focused pull requests are much easier to review and merge.
