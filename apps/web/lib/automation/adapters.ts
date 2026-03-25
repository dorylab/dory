import { CONNECTION_ERROR_CODES, ensureConnectionPoolForUser, getConnectionErrorCode } from '@/app/api/connection/utils';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import { getSessionFromRequest } from '@/lib/auth/session';
import { hasMetadataCapability, type DatabaseObjectRow, type TableColumnInfo } from '@/lib/connection/base/types';
import { getDBService } from '@/lib/database';
import {
    AutomationServiceError,
    createAutomationGuards,
    createAutomationService,
    type AutomationRuntimeAdapters,
} from '@dory/automation';
import { randomUUID } from 'node:crypto';

function toAutomationError(error: unknown, fallbackMessage: string): AutomationServiceError {
    const code = getConnectionErrorCode(error);

    if (code === CONNECTION_ERROR_CODES.notFound) {
        return new AutomationServiceError('CONNECTION_NOT_FOUND', 'Connection not found', 404);
    }

    if (error instanceof AutomationServiceError) {
        return error;
    }

    return new AutomationServiceError('INTERNAL_ERROR', fallbackMessage, 500);
}

function inferNullable(column: TableColumnInfo): boolean {
    const candidate = (column as TableColumnInfo & {
        nullable?: boolean | null;
        isNullable?: boolean | string | number | null;
    }).nullable;

    if (typeof candidate === 'boolean') {
        return candidate;
    }

    const isNullable = (column as TableColumnInfo & { isNullable?: boolean | string | number | null }).isNullable;
    if (typeof isNullable === 'boolean') {
        return isNullable;
    }
    if (typeof isNullable === 'number') {
        return isNullable !== 0;
    }
    if (typeof isNullable === 'string') {
        const normalized = isNullable.trim().toLowerCase();
        if (normalized === 'yes' || normalized === 'true') {
            return true;
        }
        if (normalized === 'no' || normalized === 'false') {
            return false;
        }
    }

    return true;
}

function filterTablesBySchema(tables: DatabaseObjectRow[], schema?: string): DatabaseObjectRow[] {
    if (!schema) {
        return tables;
    }

    return tables.filter(table => {
        const name = table.name.trim();
        if (!name.includes('.')) {
            return schema === 'public';
        }

        return name.split('.')[0] === schema;
    });
}

function toTableType(engine?: string | null): string {
    return engine?.trim() || 'table';
}

export const automationAdapters = {
    async resolveSession(req) {
        const session = await getSessionFromRequest(req);
        if (!session) {
            return null;
        }

        const userId = session.user?.id?.trim();

        return {
            session,
            user: userId
                ? {
                      id: userId,
                      ...(session.user?.email ? { email: session.user.email } : {}),
                  }
                : null,
            organizationId: resolveCurrentOrganizationId(session),
        };
    },

    async listConnections(input) {
        const db = await getDBService();
        const connections = await db.connections.list(input.organizationId);

        return connections.map(item => ({
            id: item.connection.id,
            name: item.connection.name,
            type: item.connection.type,
        }));
    },

    async runQuery(input) {
        const startedAt = performance.now();

        try {
            const { entry } = await ensureConnectionPoolForUser(input.userId, input.organizationId, input.connectionId, null);
            const result = await entry.instance.queryWithContext(input.sql, {
                queryId: randomUUID(),
            });

            const columns = (result.columns ?? []).map(column => ({
                name: column.name,
                type: column.type ?? 'unknown',
            }));
            const allRows = Array.isArray(result.rows) ? result.rows : [];
            const rows = typeof input.limit === 'number' ? allRows.slice(0, input.limit) : allRows;
            const normalizedRows = rows.map(row => {
                if (Array.isArray(row)) {
                    return row;
                }

                const record = (row ?? {}) as Record<string, unknown>;
                if (columns.length > 0) {
                    return columns.map(column => record[column.name]);
                }

                return Object.values(record);
            });

            return {
                columns,
                rows: normalizedRows,
                rowCount: typeof input.limit === 'number' ? rows.length : result.rowCount ?? rows.length,
                durationMs: Math.round(typeof result.tookMs === 'number' ? result.tookMs : performance.now() - startedAt),
            };
        } catch (error) {
            throw toAutomationError(error, 'Failed to run query');
        }
    },

    async listTables(input) {
        try {
            const { entry } = await ensureConnectionPoolForUser(input.userId, input.organizationId, input.connectionId, null);
            const metadata = entry.instance.capabilities.metadata;

            if (!hasMetadataCapability(metadata, 'getTablesOnly')) {
                throw new AutomationServiceError('INTERNAL_ERROR', 'Connection does not support table metadata', 500);
            }

            const tables = await metadata.getTablesOnly(input.database);
            const filtered = filterTablesBySchema(tables, input.schema);

            return filtered.map(table => ({
                name: table.name,
                type: toTableType(table.engine),
            }));
        } catch (error) {
            throw toAutomationError(error, 'Failed to list tables');
        }
    },

    async describeTable(input) {
        try {
            const { entry } = await ensureConnectionPoolForUser(input.userId, input.organizationId, input.connectionId, null);
            const metadata = entry.instance.capabilities.metadata;

            if (!hasMetadataCapability(metadata, 'getTableColumns')) {
                throw new AutomationServiceError('INTERNAL_ERROR', 'Connection does not support table metadata', 500);
            }

            const qualifiedTable =
                input.schema && !input.table.includes('.')
                    ? `${input.schema}.${input.table}`
                    : input.table;

            const columns = await metadata.getTableColumns(input.database, qualifiedTable);

            return {
                name: input.table,
                columns: columns.map(column => ({
                    name: column.columnName,
                    type: column.columnType ?? 'unknown',
                    nullable: inferNullable(column),
                })),
            };
        } catch (error) {
            throw toAutomationError(error, 'Failed to describe table');
        }
    },
} satisfies AutomationRuntimeAdapters;

export const automationGuards = createAutomationGuards(automationAdapters);
export const automationService = createAutomationService(automationAdapters);
