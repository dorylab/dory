import { getDatabaseProvider } from './provider';
import { PostgresChatRepository } from './postgres/impl/chat';
import { PostgresTabStateRepository } from './postgres/impl/sql-console/tabs/tab-states';
import { createPgAuditService } from './postgres/impl/audit';
import { PostgresTeamsRepository } from './postgres/impl/team';
import { PostgresConnectionsRepository } from './postgres/impl/connections';
import { PostgresAiSchemaCacheRepository } from './postgres/impl/ai-schema-cache';
import { PostgresSavedQueriesRepository } from './postgres/impl/sql-console/save-queries';
import { translateDatabase } from './i18n';

/**
 * Service bundle for Postgres
 */
export type PostgresDBService = {
    tabState: PostgresTabStateRepository;
    chat: PostgresChatRepository;
    audit: ReturnType<typeof createPgAuditService>;
    // datasource: PostgresDatasourceRepository;
    teams: PostgresTeamsRepository;
    connections: PostgresConnectionsRepository;
    aiSchemaCache: PostgresAiSchemaCacheRepository;
    savedQueries: PostgresSavedQueriesRepository;
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

            const teamsRepo = new PostgresTeamsRepository();
            await teamsRepo.init();

            const connectionsRepo = new PostgresConnectionsRepository();
            await connectionsRepo.init();

            const aiSchemaCacheRepo = new PostgresAiSchemaCacheRepository();
            await aiSchemaCacheRepo.init();

            const savedQueriesRepo = new PostgresSavedQueriesRepository();
            await savedQueriesRepo.init();

            instance = {
                tabState: tabStateRepo,
                chat: chatRepo,
                audit: createPgAuditService(),
                teams: teamsRepo,
                connections: connectionsRepo,
                aiSchemaCache: aiSchemaCacheRepo,
                savedQueries: savedQueriesRepo,
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
