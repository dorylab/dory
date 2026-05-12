import type { McpAccessTokenRecord } from '@dory/database/postgres/impl/mcp';
import { MCP_DEFAULT_SCOPES } from './auth';

export function serializeMcpToken(record: McpAccessTokenRecord) {
    return {
        id: record.id,
        name: record.name,
        tokenPrefix: record.tokenPrefix,
        scopes: Array.isArray(record.scopes) ? record.scopes : [],
        enabled: record.enabled,
        lastUsedAt: record.lastUsedAt,
        revokedAt: record.revokedAt,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

export function getDefaultMcpScopes() {
    return [...MCP_DEFAULT_SCOPES];
}
