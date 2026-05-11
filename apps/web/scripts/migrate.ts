import 'dotenv/config';
import { getClient } from '@dory/database/postgres/client';
import { getDatabaseProvider } from '@dory/database/provider';

(async () => {
    console.log('[Init] Initializing database connection...');
    const provider = getDatabaseProvider();
    console.log(`[Init] Database provider: ${provider}`);

    if (provider === 'postgres') {
        console.log('[Init] Postgres connection configuration detected');
    }

    const db = await getClient();

    if (!db) {
        console.error('[Error] Database connection initialization failed');
        process.exit(1);
    }

    console.log('[Init] Running database migrations...');

    if (provider === 'postgres') {
        const { migrateDB } = await import('@dory/database/postgres/migrate');
        await migrateDB();
    } else {
        console.warn(`[Init] Unrecognized database provider: ${provider}`);
    }

    console.log(`[Init] Database ${provider} migration completed.`);
    process.exit(0);
})();
