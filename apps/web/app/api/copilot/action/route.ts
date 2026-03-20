import 'server-only';

import { NextResponse } from 'next/server';
import { runQuickActionServer } from '@/lib/copilot/action/server/runQuickActionServer';
import type { ActionIntent } from '@/lib/copilot/action/types';
import type { CopilotFixInput } from '@/app/(app)/[organization]/[connectionId]/chatbot/copilot/types/copilot-fix-input';
import { getServerLocale } from '@/lib/i18n/server-locale';
import { translate } from '@/lib/i18n/i18n';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { isMissingAiEnvError } from '@/lib/ai/errors';
import { USE_CLOUD_AI } from '@/app/config/app';
import { buildCloudForwardHeaders } from '@/app/api/utils/cloud-ai-proxy';
import { getCloudApiBaseUrl } from '@/lib/cloud/url';

export const POST = withUserAndOrganizationHandler(async ({ req, organizationId, userId }) => {
    const locale = await getServerLocale();
    try {
        const body = (await req.json()) as { intent?: ActionIntent; input?: CopilotFixInput; model?: string | null };

        if (USE_CLOUD_AI) {
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
            const upstream = await fetch(url, {
                method: 'POST',
                headers: buildCloudForwardHeaders(req, cloudBaseUrl),
                body: JSON.stringify({
                    ...body,
                    model: null,
                    input: body.input ? { ...body.input, model: null } : body.input,
                }),
            });

            return new NextResponse(upstream.body, {
                status: upstream.status,
                headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
            });
        }

        const shouldForcePresetModel = USE_CLOUD_AI;
        const requestedModel = shouldForcePresetModel ? null : (body.model ?? body.input?.model ?? null);

        if (!body?.intent || !body?.input) {
            return new NextResponse(translate(locale, 'SqlConsole.Copilot.Errors.InvalidRequest'), { status: 400 });
        }

        const result = await runQuickActionServer(
            body.intent,
            { ...body.input, model: requestedModel },
            { locale, organizationId, userId },
        );
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
