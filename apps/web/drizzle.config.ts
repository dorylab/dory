import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    dialect: 'postgresql',
    schema: ['../../packages/database/src/postgres/schemas/index.ts'],
    out: '../../packages/database/src/postgres/migrations',
    dbCredentials: {
        url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres',
    },
});
