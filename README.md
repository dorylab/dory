## Docker 

``` docker --context orbstack run --rm -p 3000:3000 -v "$PWD/localdata:/app/localdata" --env-file .env dory/dory ```

## Monorepo layout

- `apps/web`: the Next.js application, supporting libraries, and migration scripts. Run `pnpm dev`, `pnpm build`, etc. from the repo root to operate on this package.
- `apps/electron`: the Electron runtime and packaging configuration. Use `pnpm electron:dev`, `pnpm electron:build`, or `pnpm electron:standalone` from the workspace root to drive desktop builds.
