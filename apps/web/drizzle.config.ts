import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    dialect: 'postgresql',
    schema: ['./lib/database/postgres/schemas/index.ts'],
    out: './lib/database/postgres/migrations',
    dbCredentials: {
        url: process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres',
    },
});
