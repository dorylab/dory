import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    dialect: 'postgresql',
    driver: 'pglite',
    schema: ['./lib/client/pglite/schemas/index.ts'],
    out: './lib/client/pglite/migrations',
});
