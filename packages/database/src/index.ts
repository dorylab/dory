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
import { PostgresBillingRepository } from './postgres/impl/billing';
import { PostgresMcpRepository } from './postgres/impl/mcp';
import { PostgresLocalFilesRepository } from './postgres/impl/local-files';
import { PostgresOrganizationAiProvidersRepository } from './postgres/impl/organization-ai-providers';
import { PostgresActionAuditRepository } from './postgres/impl/action-audit';
import { PostgresWorksRepository } from './postgres/impl/works';
import { PostgresResultSetsRepository } from './postgres/impl/result-sets';
import { PostgresComparisonsRepository } from './postgres/impl/comparisons';
import { PostgresImportRunsRepository } from './postgres/impl/import-runs';
import { translateDatabase } from './i18n';
import type { AiUsageRepository } from '@dory/shared';

/**
 * Service bundle for Postgres
 */
export type PostgresDBService = {
    tabState: PostgresTabStateRepository;
    chat: PostgresChatRepository;
    audit: ReturnType<typeof createPgAuditService>;
    actionAudit: PostgresActionAuditRepository;
    // datasource: PostgresDatasourceRepository;
    organizations: PostgresOrganizationsRepository;
    connections: PostgresConnectionsRepository;
    aiSchemaCache: PostgresAiSchemaCacheRepository;
    savedQueries: PostgresSavedQueriesRepository;
    savedQueryFolders: PostgresSavedQueryFoldersRepository;
    aiUsage: AiUsageRepository;
    syncOperations: PostgresSyncOperationsRepository;
    billing: PostgresBillingRepository;
    mcp: PostgresMcpRepository;
    localFiles: PostgresLocalFilesRepository;
    organizationAiProviders: PostgresOrganizationAiProvidersRepository;
    works: PostgresWorksRepository;
    resultSets: PostgresResultSetsRepository;
    comparisons: PostgresComparisonsRepository;
    importRuns: PostgresImportRunsRepository;
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

            const billingRepo = new PostgresBillingRepository();
            await billingRepo.init();

            const mcpRepo = new PostgresMcpRepository();
            await mcpRepo.init();

            const localFilesRepo = new PostgresLocalFilesRepository();
            await localFilesRepo.init();

            const organizationAiProvidersRepo = new PostgresOrganizationAiProvidersRepository();
            await organizationAiProvidersRepo.init();

            const actionAuditRepo = new PostgresActionAuditRepository();
            await actionAuditRepo.init();

            const worksRepo = new PostgresWorksRepository();
            await worksRepo.init();

            const resultSetsRepo = new PostgresResultSetsRepository();
            await resultSetsRepo.init();

            const comparisonsRepo = new PostgresComparisonsRepository(resultSetsRepo);
            await comparisonsRepo.init();

            const importRunsRepo = new PostgresImportRunsRepository();
            await importRunsRepo.init();

            instance = {
                tabState: tabStateRepo,
                chat: chatRepo,
                audit: createPgAuditService(),
                actionAudit: actionAuditRepo,
                organizations: organizationsRepo,
                connections: connectionsRepo,
                aiSchemaCache: aiSchemaCacheRepo,
                savedQueries: savedQueriesRepo,
                savedQueryFolders: savedQueryFoldersRepo,
                aiUsage: aiUsageRepo,
                syncOperations: syncOperationsRepo,
                billing: billingRepo,
                mcp: mcpRepo,
                localFiles: localFilesRepo,
                organizationAiProviders: organizationAiProvidersRepo,
                works: worksRepo,
                resultSets: resultSetsRepo,
                comparisons: comparisonsRepo,
                importRuns: importRunsRepo,
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
