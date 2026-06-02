import { createHash, randomUUID } from 'node:crypto';

import type { ActionAuditRecord, ActionContext, ActionDefinition, ActionExecutionEnvelope, ActionExecutionMetadata, ActionId, ActionProjection } from './types';
import { DEFAULT_ACTION_PROJECTION_BY_ACTOR } from './types';
import { ActionError, toActionError } from './errors';
import { assertActionAllowed } from './permissions';
import type { ActionRegistry } from './registry';

export type ExecuteActionOptions = {
    projection?: ActionProjection;
    confirmationToken?: string | null;
    reason?: string | null;
};

export async function executeAction<TOutput = unknown, TServices = unknown>(
    registry: ActionRegistry<TServices>,
    ctx: ActionContext<TServices>,
    id: ActionId,
    input: unknown,
    options: ExecuteActionOptions = {},
): Promise<ActionExecutionEnvelope<TOutput>> {
    const action = registry.get(id);
    if (!action) {
        throw new ActionError('ACTION_NOT_FOUND', `Unknown action: ${id}`, { status: 404 });
    }

    const actionRunId = ctx.actionRunId ?? randomUUID();
    const projection = resolveActionProjection(action, ctx, options.projection);
    const auditSource = action.audit.sourceByActor?.[ctx.actor.type] ?? ctx.auditSource ?? null;
    const startedAt = performance.now();
    const startedAtIso = new Date().toISOString();
    const runCtx: ActionContext<TServices> = {
        ...ctx,
        actionRunId,
        auditSource,
    };

    if (action.exposure.actors.length && !action.exposure.actors.includes(runCtx.actor.type)) {
        const error = new ActionError('ACTION_ACTOR_NOT_ALLOWED', `Actor type "${runCtx.actor.type}" is not allowed to execute action "${action.id}".`, { status: 403 });
        const execution = buildExecutionMetadata(runCtx, action, {
            actionRunId,
            projection,
            auditSource,
            status: 'denied',
            startedAt,
            startedAtIso,
        });
        await recordActionAudit(runCtx, action, input, null, execution, {
            errorCode: error.code,
            errorMessage: error.message,
        });
        throw error;
    }

    const parsedInput = action.inputSchema.safeParse(input);
    if (!parsedInput.success) {
        const execution = buildExecutionMetadata(runCtx, action, {
            actionRunId,
            projection,
            auditSource,
            status: 'invalid',
            startedAt,
            startedAtIso,
        });
        await recordActionAudit(runCtx, action, input, null, execution, {
            errorCode: 'ACTION_INPUT_INVALID',
            errorMessage: `Invalid input for action "${id}".`,
        });
        throw new ActionError('ACTION_INPUT_INVALID', `Invalid input for action "${id}".`, {
            status: 400,
            details: parsedInput.error.issues,
        });
    }

    try {
        await assertActionAllowed(runCtx as ActionContext<any>, action, parsedInput.data, {
            confirmationToken: options.confirmationToken,
        });
    } catch (error) {
        const actionError = toActionError(error);
        const execution = buildExecutionMetadata(runCtx, action, {
            actionRunId,
            projection,
            auditSource,
            status: 'denied',
            startedAt,
            startedAtIso,
        });
        await recordActionAudit(runCtx, action, parsedInput.data, null, execution, {
            errorCode: actionError.code,
            errorMessage: actionError.message,
        });
        throw actionError;
    }

    try {
        const output = await action.handler(runCtx, parsedInput.data);

        const parsedOutput = action.outputSchema.safeParse(output);
        if (!parsedOutput.success) {
            const error = new ActionError('ACTION_OUTPUT_INVALID', `Invalid output from action "${id}".`, {
                status: 500,
                details: parsedOutput.error.issues,
            });
            const execution = buildExecutionMetadata(runCtx, action, {
                actionRunId,
                projection,
                auditSource,
                status: 'error',
                startedAt,
                startedAtIso,
            });
            await recordActionAudit(runCtx, action, parsedInput.data, null, execution, {
                errorCode: error.code,
                errorMessage: error.message,
            });
            throw error;
        }

        const projectedOutput = await projectActionOutput(action, runCtx, projection, parsedOutput.data);
        const execution = buildExecutionMetadata(runCtx, action, {
            actionRunId,
            projection,
            auditSource,
            status: 'success',
            startedAt,
            startedAtIso,
        });
        await recordActionAudit(runCtx, action, parsedInput.data, parsedOutput.data, execution);
        return {
            data: projectedOutput as TOutput,
            execution,
        };
    } catch (error) {
        const actionError = toActionError(error);
        if (actionError.code !== 'ACTION_OUTPUT_INVALID') {
            const execution = buildExecutionMetadata(runCtx, action, {
                actionRunId,
                projection,
                auditSource,
                status: 'error',
                startedAt,
                startedAtIso,
            });
            await recordActionAudit(runCtx, action, parsedInput.data, null, execution, {
                errorCode: actionError.code,
                errorMessage: actionError.message,
            });
        }
        throw actionError;
    }
}

export function resolveActionProjection<TServices>(
    action: ActionDefinition<any, any, TServices>,
    ctx: ActionContext<TServices>,
    requestedProjection?: ActionProjection,
): ActionProjection {
    if (requestedProjection) return requestedProjection;
    return action.exposure.defaultProjection?.[ctx.actor.type] ?? DEFAULT_ACTION_PROJECTION_BY_ACTOR[ctx.actor.type];
}

async function projectActionOutput<TServices>(
    action: ActionDefinition<any, any, TServices>,
    ctx: ActionContext<TServices>,
    projection: ActionProjection,
    canonicalOutput: unknown,
) {
    if (projection === 'canonical') return canonicalOutput;

    const projectionDefinition = action.exposure.projections?.[projection];
    if (!projectionDefinition) return canonicalOutput;

    const projected = projectionDefinition.project ? await projectionDefinition.project(canonicalOutput, ctx) : canonicalOutput;
    const parsedProjection = projectionDefinition.schema.safeParse(projected);
    if (!parsedProjection.success) {
        throw new ActionError('ACTION_PROJECTION_INVALID', `Invalid "${projection}" projection from action "${action.id}".`, {
            status: 500,
            details: parsedProjection.error.issues,
        });
    }

    return parsedProjection.data;
}

async function recordActionAudit<TInput, TOutput, TServices>(
    ctx: ActionContext<TServices>,
    action: ActionDefinition<TInput, TOutput, TServices>,
    input: unknown,
    output: TOutput | null,
    execution: ActionExecutionMetadata,
    options: {
        errorCode?: string | null;
        errorMessage?: string | null;
    } = {},
) {
    if (!ctx.audit?.record) return;

    try {
        const typedInput = input as TInput;
        const redactedInputSummary = await buildInputSummary(ctx, action, typedInput);
        const redactedOutputSummary = output == null ? null : ((await action.audit.outputSummary?.(output, ctx)) ?? null);
        const resource = (await action.audit.resource?.(ctx, typedInput)) ?? null;
        const event: ActionAuditRecord = {
            actionRunId: execution.actionRunId,
            requestId: execution.requestId ?? null,
            actionId: action.id,
            version: action.version,
            status: execution.status,
            risk: action.risk,
            effects: action.effects,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            actorType: execution.actorType,
            actorId: execution.actorId ?? null,
            projection: execution.projection,
            source: execution.source ?? null,
            resource,
            inputHash: hashInput(input),
            redactedInputSummary,
            redactedOutputSummary,
            errorCode: options.errorCode ?? null,
            errorMessage: options.errorMessage ?? null,
            durationMs: execution.durationMs,
            createdAt: execution.finishedAt,
        };

        await ctx.audit.record(event);
    } catch (error) {
        console.error('[actions] failed to write action audit record', error);
    }
}

function buildExecutionMetadata<TServices>(
    ctx: ActionContext<TServices>,
    action: ActionDefinition<any, any, TServices>,
    options: {
        actionRunId: string;
        projection: ActionProjection;
        auditSource?: string | null;
        status: ActionAuditRecord['status'];
        startedAt: number;
        startedAtIso: string;
    },
): ActionExecutionMetadata {
    const durationMs = Math.max(0, Math.round(performance.now() - options.startedAt));

    return {
        actionRunId: options.actionRunId,
        requestId: ctx.requestId ?? null,
        actionId: action.id,
        version: action.version,
        actorType: ctx.actor.type,
        actorId: ctx.actor.id ?? null,
        source: options.auditSource ?? null,
        projection: options.projection,
        status: options.status,
        startedAt: options.startedAtIso,
        finishedAt: new Date().toISOString(),
        durationMs,
    };
}

async function buildInputSummary<TInput, TOutput, TServices>(
    ctx: ActionContext<TServices>,
    action: ActionDefinition<TInput, TOutput, TServices>,
    input: TInput,
): Promise<Record<string, unknown> | null> {
    const explicitSummary = await action.audit.inputSummary?.(input, ctx);
    if (explicitSummary) return explicitSummary;

    if (!action.audit.allowInputFields?.length || !input || typeof input !== 'object' || Array.isArray(input)) {
        return null;
    }

    const record = input as Record<string, unknown>;
    return Object.fromEntries(action.audit.allowInputFields.map(key => [key, record[key]]).filter(([, value]) => typeof value !== 'undefined'));
}

function hashInput(input: unknown): string {
    return createHash('sha256').update(stableStringify(input)).digest('hex');
}

function stableStringify(value: unknown): string {
    if (typeof value === 'undefined') return 'undefined';
    if (typeof value === 'bigint') return `${value.toString()}n`;
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
        .sort()
        .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
        .join(',')}}`;
}
