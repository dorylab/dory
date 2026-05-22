import 'server-only';

import { NextResponse } from 'next/server';

import { buildCloudForwardHeaders } from '@/app/api/utils/cloud-ai-proxy';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { USE_CLOUD_AI } from '@/app/config/app';
import { isMissingAiEnvError } from '@/lib/ai/errors';
import { getCloudApiBaseUrl } from '@/lib/cloud/url';
import { hydrateInlineAskInputForForwarding, runInlineAskSqlGeneration, type InlineAskInput } from '@/lib/copilot/action/server/inline-ask';
import { translate } from '@dory/i18n/translate';
import { getServerLocale } from '@dory/i18n/server';
import { normalizeSqlDialect } from '@/lib/sql/sql-dialect';
import type { ConnectionType } from '@dory/shared/types/connections';
import { shouldUseOrganizationProviderOverride } from '@dory/ee/ai/organization-ai-providers';

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

            const url = new URL('/api/copilot/action/inline-ask', cloudBaseUrl).toString();
            const hydratedInput = await hydrateInlineAskInputForForwarding(input, { locale, organizationId, userId });
            const upstream = await fetch(url, {
                method: 'POST',
                headers: buildCloudForwardHeaders(req, cloudBaseUrl),
                body: JSON.stringify({
                    ...body,
                    ...hydratedInput,
                    model: null,
                }),
            });

            return new NextResponse(upstream.body, {
                status: upstream.status,
                headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
            });
        }

        const result = await runInlineAskSqlGeneration(input, { locale, organizationId, userId });

        return NextResponse.json({
            sql: result.fixedSql,
            title: result.title,
            explanation: result.explanation,
            risk: result.risk,
        });
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
