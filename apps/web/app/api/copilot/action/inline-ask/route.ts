import 'server-only';

import { NextResponse } from 'next/server';

import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { isLocalMissingAiEnvError, resolveAiRouteExecution } from '@/lib/ai/execution/route-dispatch';
import { hydrateInlineAskInputForForwarding, runInlineAskSqlGeneration, type InlineAskInput } from '@/lib/copilot/action/server/inline-ask';
import { translate } from '@dory/i18n/translate';
import { getServerLocale } from '@dory/i18n/server';
import { normalizeSqlDialect } from '@/lib/sql/sql-dialect';
import type { ConnectionType } from '@dory/shared/types/connections';

export const runtime = 'nodejs';

type InlineAskRequestBody = {
    prompt?: string | null;
    editorSql?: string | null;
    connectionId?: string | null;
    connectionType?: ConnectionType | null;
    database?: string | null;
    activeSchema?: string | null;
    candidateTables?: InlineAskInput['candidateTables'];
    schemaContext?: string | null;
    model?: string | null;
};

export const POST = withUserAndOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    const locale = await getServerLocale();

    try {
        const body = (await req.json()) as InlineAskRequestBody;
        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
        const connectionId = typeof body.connectionId === 'string' ? body.connectionId.trim() : '';

        if (!prompt || !connectionId) {
            return new NextResponse(translate(locale, 'SqlConsole.Copilot.Errors.InvalidRequest'), { status: 400 });
        }

        const input: InlineAskInput = {
            prompt,
            editorSql: typeof body.editorSql === 'string' ? body.editorSql : '',
            connectionId,
            dialect: normalizeSqlDialect(body.connectionType ?? undefined),
            database: body.database ?? null,
            activeSchema: body.activeSchema ?? null,
            candidateTables: body.candidateTables ?? null,
            schemaContext: body.schemaContext ?? null,
            model: body.model ?? null,
        };

        const execution = await resolveAiRouteExecution({
            req,
            db,
            organizationId,
            role: 'action',
            requestedModel: input.model,
            includeModel: false,
            proxy: {
                pathname: '/api/copilot/action/inline-ask',
                buildBody: async execution => {
                    const hydratedInput = await hydrateInlineAskInputForForwarding({ ...input, model: execution.requestedModel }, { locale, organizationId, userId });
                    return {
                        ...body,
                        ...hydratedInput,
                    };
                },
            },
        });
        if (execution.proxiedResponse) return execution.proxiedResponse;

        const result = await runInlineAskSqlGeneration({ ...input, model: execution.requestedModel }, { locale, organizationId, userId });

        return NextResponse.json({
            sql: result.fixedSql,
            title: result.title,
            explanation: result.explanation,
            risk: result.risk,
        });
    } catch (e: any) {
        const rawMessage = typeof e?.message === 'string' ? e.message : '';
        if (isLocalMissingAiEnvError(e)) {
            return NextResponse.json(
                {
                    code: 'MISSING_AI_ENV',
                    message: translate(locale, 'SqlConsole.Copilot.Errors.MissingAiEnv'),
                },
                { status: 500 },
            );
        }

        const message = rawMessage || translate(locale, 'SqlConsole.Copilot.Errors.InternalError');
        return new NextResponse(message, { status: 500 });
    }
});
