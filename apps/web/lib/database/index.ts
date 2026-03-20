import { getDatabaseProvider } from './provider';
import { PostgresChatRepository } from './postgres/impl/chat';
import { PostgresTabStateRepository } from './postgres/impl/sql-console/tabs/tab-states';
import { createPgAuditService } from './postgres/impl/audit';
import { PostgresOrganizationsRepository } from './postgres/impl/organization';
import { PostgresConnectionsRepository } from './postgres/impl/connections';
import { PostgresAiSchemaCacheRepository } from './postgres/impl/ai-schema-cache';
import { PostgresSavedQueriesRepository } from './postgres/impl/sql-console/save-queries';
import { PostgresSavedQueryFoldersRepository } from './postgres/impl/sql-console/saved-query-folders';
import { PostgresAiUsageRepository } from './postgres/impl/ai-usage';
import { PostgresSyncOperationsRepository } from './postgres/impl/sync-operations';
import { translateDatabase } from './i18n';
import type { AiUsageRepository } from '@/types';

/**
 * Service bundle for Postgres
 */
export type PostgresDBService = {
    tabState: PostgresTabStateRepository;
    chat: PostgresChatRepository;
    audit: ReturnType<typeof createPgAuditService>;
    // datasource: PostgresDatasourceRepository;
    organizations: PostgresOrganizationsRepository;
    connections: PostgresConnectionsRepository;
    aiSchemaCache: PostgresAiSchemaCacheRepository;
    savedQueries: PostgresSavedQueriesRepository;
    savedQueryFolders: PostgresSavedQueryFoldersRepository;
    aiUsage: AiUsageRepository;
    syncOperations: PostgresSyncOperationsRepository;
};

/**
 * Public unified type
 */
// export type DBService = PostgresDBService | SqliteDBService;
export type DBService = PostgresDBService;

let instance: DBService | null = null;

/**
 * Get global DBService instance (Postgres/SQLite by env)
 */
export async function getDBService(): Promise<DBService> {
    if (instance) return instance;

    const dbType = getDatabaseProvider();

    switch (dbType) {
        case 'pglite':
        case 'postgres': {
            const tabStateRepo = new PostgresTabStateRepository();
            await tabStateRepo.init();

            const chatRepo = new PostgresChatRepository();
            await chatRepo.init();

            const organizationsRepo = new PostgresOrganizationsRepository();
            await organizationsRepo.init();

            const connectionsRepo = new PostgresConnectionsRepository();
            await connectionsRepo.init();

            const aiSchemaCacheRepo = new PostgresAiSchemaCacheRepository();
            await aiSchemaCacheRepo.init();

            const savedQueriesRepo = new PostgresSavedQueriesRepository();
            await savedQueriesRepo.init();

            const savedQueryFoldersRepo = new PostgresSavedQueryFoldersRepository();
            await savedQueryFoldersRepo.init();

            const aiUsageRepo = new PostgresAiUsageRepository();
            await aiUsageRepo.init();

            const syncOperationsRepo = new PostgresSyncOperationsRepository();
            await syncOperationsRepo.init();

            instance = {
                tabState: tabStateRepo,
                chat: chatRepo,
                audit: createPgAuditService(),
                organizations: organizationsRepo,
                connections: connectionsRepo,
                aiSchemaCache: aiSchemaCacheRepo,
                savedQueries: savedQueriesRepo,
                savedQueryFolders: savedQueryFoldersRepo,
                aiUsage: aiUsageRepo,
                syncOperations: syncOperationsRepo,
            };
            break;
        }
        // case 'sqlite': {
        //     const sqliteTabStateRepo = new SqliteTabStateRepository();
        //     await sqliteTabStateRepo.init();

        //     const sqliteChatRepo = new SqliteChatRepository();
        //     await sqliteChatRepo.init();

        //     instance = {
        //         tabState: sqliteTabStateRepo,
        //         chat: sqliteChatRepo,
        //         audit: createSqliteAuditService(),
        //         datasource: null,
        //     };
        //     break;
        // }
        // Future MySQL/ClickHouse/other implementations can add cases here
        default: {
            throw new Error(translateDatabase('Database.Errors.UnsupportedDbType', { dbType }));
        }
    }

    // instance must be assigned here
    return instance!;
}
