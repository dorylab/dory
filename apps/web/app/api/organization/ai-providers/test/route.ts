import { NextResponse } from 'next/server';
import { z } from 'zod';

import { withManagedOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { testOrganizationAiProviderConfig, getOrganizationAiProviderTestErrorMessage } from '@/lib/server/organization-ai-providers/test-provider';
import { isAiProviderApiKeyRequired, isAiProviderAvailable, isAiProviderBaseUrlRequired, isAiProviderModelAllowed } from '@dory/ee/ai/provider-options';
import { resolveOrganizationAiProviderEntitlementForRequest } from '@/lib/server/organization-ai-providers/entitlement';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@dory/shared/errors';
import { ORGANIZATION_AI_PROVIDERS } from '@dory/database/postgres/impl/organization-ai-providers';

export const runtime = 'nodejs';

const testSchema = z.object({
    provider: z.enum(ORGANIZATION_AI_PROVIDERS).default('openai'),
    model: z.string().trim().min(1).max(120),
    baseUrl: z.string().trim().max(500).optional().nullable(),
    apiKey: z.string().trim().max(2000).optional().nullable(),
});

export const POST = withManagedOrganizationHandler(async ({ req, db, organizationId }) => {
    const locale = await getApiLocale();
    const parsed = testSchema.safeParse(await req.json().catch(() => ({})));

    if (!parsed.success) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: parsed.error.issues[0]?.message ?? translateApi('Api.Errors.InvalidParams', undefined, locale),
            }),
            { status: 400 },
        );
    }

    const entitlement = await resolveOrganizationAiProviderEntitlementForRequest(db, organizationId);
    if (!entitlement.capability.enabled) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.FORBIDDEN,
                message: translateApi('Api.OrganizationAiProviders.OrganizationProviderUnavailableInOss', undefined, locale),
            }),
            { status: 403 },
        );
    }

    if (!isAiProviderAvailable(parsed.data.provider)) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: translateApi('Api.OrganizationAiProviders.UnsupportedProvider', undefined, locale),
            }),
            { status: 400 },
        );
    }

    if (!isAiProviderModelAllowed(parsed.data.provider, parsed.data.model)) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: translateApi('Api.OrganizationAiProviders.UnsupportedModel', undefined, locale),
            }),
            { status: 400 },
        );
    }

    if (isAiProviderBaseUrlRequired(parsed.data.provider) && !parsed.data.baseUrl) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: translateApi('Api.OrganizationAiProviders.BaseUrlRequired', undefined, locale),
            }),
            { status: 400 },
        );
    }

    if (isAiProviderApiKeyRequired(parsed.data.provider) && !parsed.data.apiKey) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: translateApi('Api.OrganizationAiProviders.ApiKeyRequired', undefined, locale),
            }),
            { status: 400 },
        );
    }

    try {
        await testOrganizationAiProviderConfig({
            provider: parsed.data.provider,
            model: parsed.data.model,
            baseUrl: parsed.data.baseUrl,
            apiKey: parsed.data.apiKey,
        });

        return NextResponse.json(ResponseUtil.success({ ok: true }));
    } catch (error) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: translateApi(
                    'Api.OrganizationAiProviders.TestFailed',
                    {
                        reason: getOrganizationAiProviderTestErrorMessage(error),
                    },
                    locale,
                ),
            }),
            { status: 400 },
        );
    }
});
