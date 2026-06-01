import type { ActionAuditPolicy, ActionPermissionRequirement } from '@dory/actions';
import type { WebActionServices } from './types';

export const readWorkspace: ActionPermissionRequirement[] = [{ resource: 'workspace', action: 'read' }];
export const writeWorkspace: ActionPermissionRequirement[] = [{ resource: 'workspace', action: 'write' }];
export const readConnection: ActionPermissionRequirement[] = [
    { resource: 'workspace', action: 'read' },
    { resource: 'connection', action: 'read' },
];
export const createConnection: ActionPermissionRequirement[] = [
    { resource: 'workspace', action: 'write' },
    { resource: 'connection', action: 'create' },
];
export const updateConnection: ActionPermissionRequirement[] = [
    { resource: 'workspace', action: 'write' },
    { resource: 'connection', action: 'update' },
];
export const deleteConnection: ActionPermissionRequirement[] = [
    { resource: 'workspace', action: 'write' },
    { resource: 'connection', action: 'delete' },
];

export function defaultActionAuditPolicy(domain: string): ActionAuditPolicy<any, any, WebActionServices> {
    if (domain === 'query') {
        return {
            sourceByActor: {
                user: 'user_sql_console',
                agent: 'ai_sql_runner',
                mcp: 'mcp_sql_runner',
                automation: 'automation_sql',
            },
            allowInputFields: ['connectionId', 'identityId', 'database', 'sessionId', 'tabId', 'source'],
        };
    }

    if (domain === 'table') {
        return {
            sourceByActor: {
                user: 'user_table_preview',
                agent: 'ai_table_preview',
                mcp: 'mcp_table_preview',
                automation: 'automation_schema_metadata',
            },
            allowInputFields: ['connectionId', 'identityId', 'database', 'table', 'limit'],
        };
    }

    return {
        sourceByActor: {
            user: 'dory_schema_metadata',
            agent: 'ai_schema_metadata',
            mcp: 'mcp_schema_metadata',
            automation: 'automation_schema_metadata',
        },
        allowInputFields: ['connectionId', 'identityId', 'database', 'schema', 'table', 'id'],
    };
}
