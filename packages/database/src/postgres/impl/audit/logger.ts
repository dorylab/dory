// studio/lib/database/pg/impl/audit/logger.ts
import { queryAudit } from '../../schemas/audit';
import type { PostgresDBClient } from '@dory/shared';
import { getClient } from '../../client';
import type { AuditPayload, QueryStatus } from '@dory/shared/types/audit';
import { translateDatabase } from '@dory/database/i18n';

export class PgAuditLoggerRepository {
    private db!: PostgresDBClient;
    private inited = false;

    async init(): Promise<void> {
        if (this.inited) return;
        this.db = (await getClient()) as PostgresDBClient;
        this.inited = true;
    }

    async log(payload: AuditPayload & { status: QueryStatus }): Promise<void> {
        await this.insertAudit(payload, payload.status, payload.errorMessage ?? undefined);
    }

    async logSuccess(payload: AuditPayload): Promise<void> {
        await this.insertAudit(payload, 'success');
    }

    async logError(payload: AuditPayload & { errorMessage: string }): Promise<void> {
        await this.insertAudit(payload, 'error', payload.errorMessage);
    }

    async logDenied(payload: AuditPayload & { errorMessage: string }): Promise<void> {
        await this.insertAudit(payload, 'denied', payload.errorMessage);
    }

    async logCanceled(payload: AuditPayload & { errorMessage?: string | null }): Promise<void> {
        await this.insertAudit(payload, 'canceled', payload.errorMessage ?? undefined);
    }

    private async insertAudit(payload: AuditPayload, status: QueryStatus, errorMessage?: string): Promise<void> {
        try {
            if (!this.inited) await this.init();

            await this.db.insert(queryAudit).values({
                // —— Required fields —— //
                organizationId: payload.organizationId,
                tabId: payload.tabId,
                userId: payload.userId,
                source: payload.source,
                sqlText: payload.sqlText,
                status,

                // —— Connection info —— //
                connectionId: payload.connectionId ?? null,
                connectionName: payload.connectionName ?? null,
                identityId: payload.identityId ?? null,
                identityName: payload.identityName ?? null,
                identityUsername: payload.identityUsername ?? null,
                identityRole: payload.identityRole ?? null,
                identityDatabase: payload.identityDatabase ?? null,
                databaseName: payload.databaseName ?? null,

                // —— Query identifier —— //
                queryId: payload.queryId ?? null,

                // —— Result info —— //
                errorMessage: errorMessage ?? payload.errorMessage ?? null,
                durationMs: payload.durationMs ?? null,
                rowsRead: payload.rowsRead ?? null,
                bytesRead: payload.bytesRead ?? null,
                rowsWritten: payload.rowsWritten ?? null,

                // —— Extra fields —— //
                extraJson: payload.extraJson ?? null,
            });
        } catch (error) {
            console.error(translateDatabase('Database.Logs.QueryAuditWriteFailed'), error);
        }
    }
}
