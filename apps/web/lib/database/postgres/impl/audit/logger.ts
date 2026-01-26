// studio/lib/database/pg/impl/audit/logger.ts
import { queryAudit } from '../../schemas/audit';
import type { PostgresDBClient } from '../../../../../types/database';
import { getClient } from '../../client';
import { AuditPayload } from '@/types/audit';
import { translateDatabase } from '@/lib/database/i18n';

export class PgAuditLoggerRepository {
    private db!: PostgresDBClient;
    private inited = false;

    async init(): Promise<void> {
        if (this.inited) return;
        this.db = (await getClient()) as PostgresDBClient;
        this.inited = true;
    }

    async logSuccess(payload: AuditPayload): Promise<void> {
        await this.insertAudit(payload, 'success');
    }

    async logError(payload: AuditPayload & { errorMessage: string }): Promise<void> {
        await this.insertAudit(payload, 'error', payload.errorMessage);
    }

    private async insertAudit(payload: AuditPayload, status: 'success' | 'error', errorMessage?: string): Promise<void> {
        try {
            if (!this.inited) await this.init();

            await this.db.insert(queryAudit).values({
                // —— Required fields —— //
                teamId: payload.teamId,
                tabId: payload.tabId,
                userId: payload.userId,
                source: payload.source,
                sqlText: payload.sqlText,
                status,

                // —— Connection info —— //
                connectionId: payload.connectionId ?? null,
                connectionName: payload.connectionName ?? null,
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
