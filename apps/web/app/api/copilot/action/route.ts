import 'server-only';

import { NextResponse } from 'next/server';
import { runQuickActionServer } from '@/lib/copilot/action/server/runQuickActionServer';
import { hydrateActionContext } from '@/lib/copilot/action/server/hydrate-action-context';
import { toActionContext } from '@/lib/copilot/action/server/to-action-context';
import type { ActionIntent } from '@/lib/copilot/action/types';
import type { ActionContext } from '@/lib/copilot/action/types';
import type { CopilotFixInput } from '@/app/(app)/[organization]/[connectionId]/chatbot/copilot/types/copilot-fix-input';
import { getServerLocale } from '@dory/i18n/server';
import { translate } from '@dory/i18n/translate';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { isLocalMissingAiEnvError, resolveAiRouteExecution } from '@/lib/ai/execution/route-dispatch';

export const POST = withUserAndOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    const locale = await getServerLocale();
    try {
        const body = (await req.json()) as { intent?: ActionIntent; input?: CopilotFixInput; model?: string | null };

        if (!body?.intent || !body?.input) {
            return new NextResponse(translate(locale, 'SqlConsole.Copilot.Errors.InvalidRequest'), { status: 400 });
        }

        const input = body.input;
        const requestedModelFromBody = input.model ?? body.model ?? null;
        const execution = await resolveAiRouteExecution({
            req,
            db,
            organizationId,
            role: 'action',
            requestedModel: requestedModelFromBody,
            includeModel: false,
            proxy: {
                pathname: '/api/copilot/action',
                bodyMode: 'copilot-action',
                buildBody: async execution => {
                    const hydratedInput = await hydrateInputForForwarding({ ...input, model: execution.requestedModel }, locale, { organizationId, userId });
                    return {
                        ...body,
                        input: hydratedInput,
                    };
                },
            },
        });
        if (execution.proxiedResponse) return execution.proxiedResponse;

        const result = await runQuickActionServer(body.intent, { ...input, model: execution.requestedModel }, { locale, organizationId, userId });
        return NextResponse.json(result);
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

async function hydrateInputForForwarding(
    input: CopilotFixInput,
    locale: Awaited<ReturnType<typeof getServerLocale>>,
    identity: { organizationId?: string; userId?: string },
): Promise<CopilotFixInput> {
    const hydrated = await hydrateActionContext(toActionContext(input, locale, identity));
    return actionContextToInput(input, hydrated);
}

function actionContextToInput(input: CopilotFixInput, ctx: ActionContext): CopilotFixInput {
    return {
        ...input,
        activeSchema: ctx.activeSchema ?? input.activeSchema ?? null,
        candidateTables: ctx.candidateTables ?? input.candidateTables ?? null,
        schemaContext: ctx.schemaContext ?? input.schemaContext ?? null,
        lastExecution: {
            ...input.lastExecution,
            dialect: ctx.dialect,
            database: ctx.database ?? input.lastExecution.database ?? null,
            sql: ctx.sql,
            error: ctx.error
                ? {
                      message: ctx.error.message,
                      code: ctx.error.code ?? null,
                  }
                : input.lastExecution.error,
        },
    };
}
