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
import { isMissingAiEnvError } from '@/lib/ai/errors';
import { USE_CLOUD_AI } from '@/app/config/app';
import { buildCloudForwardHeaders } from '@/app/api/utils/cloud-ai-proxy';
import { getCloudApiBaseUrl } from '@/lib/cloud/url';
import { shouldUseOrganizationProviderOverride } from '@dory/ee/ai/organization-ai-providers';

export const POST = withUserAndOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    const locale = await getServerLocale();
    try {
        const body = (await req.json()) as { intent?: ActionIntent; input?: CopilotFixInput; model?: string | null };

        if (!body?.intent || !body?.input) {
            return new NextResponse(translate(locale, 'SqlConsole.Copilot.Errors.InvalidRequest'), { status: 400 });
        }

        const organizationUsesProviderOverride = await shouldUseOrganizationProviderOverride(db, organizationId);

        if (USE_CLOUD_AI && !organizationUsesProviderOverride) {
            const cloudBaseUrl = getCloudApiBaseUrl();
            if (!cloudBaseUrl) {
                return NextResponse.json(
                    {
                        code: 'CLOUD_API_NOT_CONFIGURED',
                        message: translate(locale, 'SqlConsole.Copilot.Errors.InternalError'),
                    },
                    { status: 500 },
                );
            }

            const url = new URL('/api/copilot/action', cloudBaseUrl).toString();
            const requestedModel = body.input?.model ?? body.model ?? null;
            const hydratedInput = await hydrateInputForForwarding({ ...body.input, model: requestedModel }, locale, { organizationId, userId });
            const upstream = await fetch(url, {
                method: 'POST',
                headers: buildCloudForwardHeaders(req, cloudBaseUrl),
                body: JSON.stringify({
                    ...body,
                    model: null,
                    input: { ...hydratedInput, model: null },
                }),
            });

            return new NextResponse(upstream.body, {
                status: upstream.status,
                headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
            });
        }

        const shouldForcePresetModel = USE_CLOUD_AI && !organizationUsesProviderOverride;
        const requestedModel = shouldForcePresetModel ? null : (body.model ?? body.input?.model ?? null);

        const result = await runQuickActionServer(body.intent, { ...body.input, model: requestedModel }, { locale, organizationId, userId });
        return NextResponse.json(result);
    } catch (e: any) {
        const rawMessage = typeof e?.message === 'string' ? e.message : '';
        const isMissingEnv = isMissingAiEnvError(e);
        if (isMissingEnv && !USE_CLOUD_AI) {
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
