import type { McpAccessTokenRecord } from '@dory/database/postgres/impl/mcp';
import type { McpAuthorizationRequestRecord } from '@dory/database/postgres/impl/mcp';
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

export function serializeMcpAuthorizationRequest(record: McpAuthorizationRequestRecord) {
    return {
        id: record.id,
        clientName: record.clientName,
        scopes: Array.isArray(record.scopes) ? record.scopes : [],
        status: record.status,
        organizationId: record.organizationId,
        userId: record.userId,
        approvedAt: record.approvedAt,
        deniedAt: record.deniedAt,
        consumedAt: record.consumedAt,
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

export function getDefaultMcpScopes() {
    return [...MCP_DEFAULT_SCOPES];
}
