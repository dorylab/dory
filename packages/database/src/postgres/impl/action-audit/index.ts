import { actionAudit } from '../../schemas/audit';
import type { PostgresDBClient } from '@dory/shared';
import { getClient } from '../../client';

export type ActionAuditLogPayload = {
    actionRunId: string;
    requestId?: string | null;
    actionId: string;
    version: number;
    status: string;
    risk: string;
    effects?: string[] | null;
    organizationId: string;
    userId: string;
    actorType: string;
    actorId?: string | null;
    projection: string;
    source?: string | null;
    resource?: Record<string, unknown> | null;
    inputHash?: string | null;
    redactedInputSummary?: Record<string, unknown> | null;
    redactedOutputSummary?: Record<string, unknown> | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    durationMs: number;
};

export class PostgresActionAuditRepository {
    private db!: PostgresDBClient;
    private inited = false;

    async init(): Promise<void> {
        if (this.inited) return;
        this.db = (await getClient()) as PostgresDBClient;
        this.inited = true;
    }

    async log(payload: ActionAuditLogPayload): Promise<void> {
        try {
            if (!this.inited) await this.init();

            await this.db.insert(actionAudit).values({
                actionRunId: payload.actionRunId,
                requestId: payload.requestId ?? null,
                actionId: payload.actionId,
                actionVersion: payload.version,
                status: payload.status,
                risk: payload.risk,
                effects: payload.effects ?? null,
                organizationId: payload.organizationId,
                userId: payload.userId,
                actorType: payload.actorType,
                actorId: payload.actorId ?? null,
                projection: payload.projection,
                source: payload.source ?? null,
                resource: payload.resource ?? null,
                inputHash: payload.inputHash ?? null,
                redactedInputSummary: payload.redactedInputSummary ?? null,
                redactedOutputSummary: payload.redactedOutputSummary ?? null,
                errorCode: payload.errorCode ?? null,
                errorMessage: payload.errorMessage ?? null,
                durationMs: payload.durationMs,
            });
        } catch (error) {
            console.error('[action-audit] failed to write action audit record', error);
        }
    }
}
