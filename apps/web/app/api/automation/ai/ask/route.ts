import { NextResponse } from 'next/server';
import { z } from 'zod';
import { tool, stepCountIs } from 'ai';
import { ErrorCodes } from '@dory/shared/errors';
import { ResponseUtil } from '@/lib/result';
import { generateText } from '@/lib/ai/gateway';
import { requireLocalAiRouteModel, resolveAiRouteExecution } from '@/lib/ai/execution/route-dispatch';
import { isAiQuotaExceededError, toAiQuotaExceededResponse } from '@/lib/ai/usage-quota';
import { buildSchemaContext, getDefaultSchemaSampleLimits } from '@/lib/ai/prompts/contexts/schema';
import { SYSTEM_PROMPT } from '@/lib/ai/prompts/system/core';
import { ensureConnectionPoolForUser } from '@/lib/connection/utils';
import { isMissingAiEnvError } from '@/lib/ai/errors';
import { withAutomationHandler } from '../../with-automation-handler';
import { isReadOnlyQuery, AI_ROW_LIMIT } from '../../utils';
import { getReadOnlyQueryKeywordList } from '@/app/api/utils/sql-readonly';
import { logDeniedSqlAudit } from '@/lib/server/sql-audit';

/**
 * POST /api/automation/ai/ask
 *
 * Ask a natural language question about your data.
 * AI will generate SQL, execute it, and return the answer.
 *
 * Body:
 * {
 *   "connectionId": "xxx",
 *   "question": "Top 10 slow queries yesterday",
 *   "database": "mydb"    // optional
 * }
 */
export const POST = withAutomationHandler(async ({ req, db, userId, organizationId }) => {
    const body = await req.json();
    const { connectionId, question, database } = body;

    if (!connectionId) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.INVALID_PARAMS,
                message: 'Missing required field: connectionId',
            }),
            { status: 400 },
        );
    }

    if (!question || typeof question !== 'string' || !question.trim()) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.INVALID_PARAMS,
                message: 'Missing required field: question',
            }),
            { status: 400 },
        );
    }

    // Verify connection exists and is accessible
    try {
        await ensureConnectionPoolForUser(userId, organizationId, connectionId, null);
    } catch {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.NOT_FOUND,
                message: 'Connection not found or could not be established.',
            }),
            { status: 404 },
        );
    }

    // Build schema context for AI
    const defaults = getDefaultSchemaSampleLimits();
    const schemaContext = await buildSchemaContext({
        userId,
        organizationId,
        datasourceId: connectionId,
        database,
        tableSampleLimit: defaults.table,
        columnSampleLimit: defaults.column,
    });

    // Build SQL runner tool for AI to use
    const sqlResults: Array<{ sql: string; rows: unknown[]; columns: unknown; rowCount: number; error?: string }> = [];

    const sqlRunner = tool({
        description: 'Execute a read-only SQL query against the database and return the results.',
        inputSchema: z.object({
            sql: z.string().min(1, 'SQL query is required'),
            database: z.string().optional(),
        }),
        execute: async ({ sql, database: db }) => {
            const trimmed = sql.trim();
            if (!isReadOnlyQuery(trimmed)) {
                await logDeniedSqlAudit(
                    {
                        organizationId,
                        userId,
                        source: 'automation_ai_sql',
                        connectionId,
                        databaseName: db ?? database ?? null,
                    },
                    {
                        sqlText: trimmed,
                        databaseName: db ?? database ?? null,
                        errorMessage: `Only read-only queries (${getReadOnlyQueryKeywordList()}) are allowed.`,
                    },
                );
                const errorResult = {
                    ok: false,
                    error: `Only read-only queries (${getReadOnlyQueryKeywordList()}) are allowed.`,
                    sql: trimmed,
                };
                sqlResults.push({ sql: trimmed, rows: [], columns: null, rowCount: 0, error: errorResult.error });
                return errorResult;
            }

            try {
                const { entry } = await ensureConnectionPoolForUser(userId, organizationId, connectionId, null);
                const result = await entry.instance.queryWithContext(trimmed, {
                    database: db ?? database,
                });

                const rows = Array.isArray(result.rows) ? result.rows.slice(0, AI_ROW_LIMIT) : [];
                const columns = result.columns ?? null;
                const rowCount = result.rowCount ?? rows.length;

                sqlResults.push({ sql: trimmed, rows, columns, rowCount });

                return {
                    ok: true,
                    columns,
                    rows,
                    rowCount,
                    limited: rows.length >= AI_ROW_LIMIT,
                };
            } catch (err: any) {
                const errorMsg = String(err?.message || err);
                sqlResults.push({ sql: trimmed, rows: [], columns: null, rowCount: 0, error: errorMsg });
                return {
                    ok: false,
                    error: errorMsg,
                    sql: trimmed,
                };
            }
        },
    });

    // Build system prompt
    const schemaSection = schemaContext ? `\nSchema Context:\n${schemaContext}` : '';
    const systemPrompt = [
        SYSTEM_PROMPT.trim(),
        'You have access to a sqlRunner tool to execute read-only SQL queries.',
        'When the user asks a data question, generate appropriate SQL and execute it using the tool.',
        'After getting results, provide a clear, concise answer based on the data.',
        schemaSection,
    ]
        .filter(Boolean)
        .join('\n\n');

    try {
        const execution = await resolveAiRouteExecution({
            req,
            db,
            organizationId,
            role: 'chat',
            includeModel: true,
            allowCloudProxy: false,
        });
        const model = requireLocalAiRouteModel(execution);

        const result = await generateText({
            model,
            system: systemPrompt,
            messages: [{ role: 'user' as const, content: question.trim() }],
            tools: { sqlRunner },
            toolChoice: 'auto',
            stopWhen: stepCountIs(4),
            context: {
                organizationId,
                userId,
                feature: 'automation_ai_ask',
                model: execution.modelName,
                provider: execution.providerKey ?? undefined,
                gateway: execution.gateway ?? undefined,
            },
        });

        return NextResponse.json(
            ResponseUtil.success({
                answer: result.text,
                sqlResults,
                usage: result.usage
                    ? {
                          inputTokens: result.usage.inputTokens,
                          outputTokens: result.usage.outputTokens,
                          totalTokens: result.usage.totalTokens,
                      }
                    : null,
            }),
        );
    } catch (error: any) {
        if (isAiQuotaExceededError(error)) {
            return toAiQuotaExceededResponse(error);
        }

        if (isMissingAiEnvError(error)) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.ERROR,
                    message: 'AI service is not configured. Set DORY_AI_PROVIDER and related environment variables.',
                }),
                { status: 503 },
            );
        }

        console.error('[automation/ai/ask] failed', error);
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.ERROR,
                message: error?.message ?? 'AI request failed',
            }),
            { status: 500 },
        );
    }
});
