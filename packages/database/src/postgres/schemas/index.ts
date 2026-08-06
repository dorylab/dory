import * as tabsSchema from './tabs';
import * as authSchemaSchema from './auth-schema';
import * as authRelationsSchema from './auth-relations';
import * as chatSchema from './chat';
import * as auditSchema from './audit';
import * as organizationSchema from './organizations/organizations';
import * as organizationMemberSchema from './organizations/organization-members';
import * as connectionsSchema from './connections';
import * as aiSchemaCache from './ai-schema-cache';
import * as savedQueriesSchema from './saved-queries';
import * as savedQueryFoldersSchema from './saved-query-folders';
import * as aiUsageSchema from './ai-usage';
import * as syncOperationsSchema from './sync-operations';
import * as mcpSchema from './mcp';
import * as localFilesSchema from './local-files';
import * as organizationAiProvidersSchema from './organization-ai-providers';
import * as worksSchema from './works';
import * as resultSetsSchema from './result-sets';
import * as comparisonsSchema from './comparisons';
import * as importRunsSchema from './import-runs';

export * from './tabs';
export * from './auth-schema';
export * from './auth-relations';
export * from './chat';
export * from './audit';
export * from './organizations/organization-members';
export * from './organizations/organizations';
export * from './connections';
export * from './ai-schema-cache';
export * from './saved-queries';
export * from './saved-query-folders';
export * from './ai-usage';
export * from './sync-operations';
export * from './mcp';
export * from './local-files';
export * from './organization-ai-providers';
export * from './works';
export * from './result-sets';
export * from './comparisons';
export * from './import-runs';

export const schema = {
    ...tabsSchema,
    ...authSchemaSchema,
    ...authRelationsSchema,
    ...chatSchema,
    ...auditSchema,
    ...organizationSchema,
    ...organizationMemberSchema,
    ...connectionsSchema,
    ...aiSchemaCache,
    ...savedQueriesSchema,
    ...savedQueryFoldersSchema,
    ...aiUsageSchema,
    ...syncOperationsSchema,
    ...mcpSchema,
    ...localFilesSchema,
    ...organizationAiProvidersSchema,
    ...worksSchema,
    ...resultSetsSchema,
    ...comparisonsSchema,
    ...importRunsSchema,
};

export type DBSchema = typeof schema;
