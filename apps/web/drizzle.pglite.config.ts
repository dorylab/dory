import { defineConfig } from 'drizzle-kit';
import path from 'path';
import { extractFilePath } from '@dory/database/pglite/url';

const pgliteDataDir = process.env.PGLITE_DB_PATH
    ? extractFilePath(process.env.PGLITE_DB_PATH)
    : './data/dory.db';

export default defineConfig({
    dialect: 'postgresql',
    driver: 'pglite',
    schema: ['../../packages/database/src/postgres/schemas/index.ts'],
    out: '../../packages/database/src/pglite/migrations',
    dbCredentials: {
        url: path.resolve(process.cwd(), pgliteDataDir),
    },
});
