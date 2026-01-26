// scripts/migrate.ts
import { getClient } from '../lib/database/postgres/client';
import { getDatabaseProvider } from '../lib/database/provider';

(async () => {
    console.log('[Init] Initializing database connection...');
    const db = await getClient();

    if (!db) {
        console.error('[Error] Database connection initialization failed');
        process.exit(1);
    }

    console.log('[Init] Running database migrations...');
    const provider = getDatabaseProvider();

    if (provider === 'postgres') {
        const { migrateDB } = await import('../lib/database/postgres/migrate');
        await migrateDB();
    } else {
        console.warn(`[Init] Unrecognized database provider: ${provider}`);
    }

    console.log(
        `[Init] Database ${provider} migration completed, path: ${process.env.DATABASE_URL}`
    );
    process.exit(0);
})();
