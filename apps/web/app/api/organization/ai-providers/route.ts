import { NextResponse } from 'next/server';
import { z } from 'zod';

import { withManagedOrganizationHandler, withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { isAiProviderApiKeyRequired, isAiProviderAvailable, isAiProviderBaseUrlRequired, isAiProviderModelAllowed, isLocalAiAgentProvider } from '@dory/ee/ai/provider-options';
import { canManageOrganization, resolveOrganizationAccess } from '@/lib/server/authz';
import { buildOrganizationAiProvidersPayloadForRequest } from '@/lib/server/organization-ai-providers/cloud-system-provider';
import { resolveOrganizationAiProviderEntitlementForRequest } from '@/lib/server/organization-ai-providers/entitlement';
import { assertLocalAiAgentAvailable } from '@/lib/server/local-ai/detection';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@dory/shared/errors';
import { ORGANIZATION_AI_PROVIDERS } from '@dory/database/postgres/impl/organization-ai-providers';

export const runtime = 'nodejs';

const createSchema = z.object({
    provider: z.enum(ORGANIZATION_AI_PROVIDERS).default('openai'),
    model: z.string().trim().min(1).max(120),
    baseUrl: z.string().trim().max(500).optional().nullable(),
    apiKey: z.string().trim().max(2000).optional().nullable(),
});

export const GET = withUserAndOrganizationHandler(async ({ db, organizationId, userId }) => {
    const access = await resolveOrganizationAccess(organizationId, userId);
    const entitlement = await resolveOrganizationAiProviderEntitlementForRequest(db, organizationId);
    return NextResponse.json(
        ResponseUtil.success(
            await buildOrganizationAiProvidersPayloadForRequest({
                db,
                organizationId,
                canManage: canManageOrganization(access),
                entitlementMode: entitlement.entitlementMode,
                billingPlan: entitlement.billingPlan,
            }),
        ),
    );
});

export const POST = withManagedOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    const locale = await getApiLocale();
    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));

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
    if (!entitlement.capability.enabled && !isLocalAiAgentProvider(parsed.data.provider)) {
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

    if (isLocalAiAgentProvider(parsed.data.provider)) {
        try {
            await assertLocalAiAgentAvailable(parsed.data.provider, {
                db,
                organizationId,
                target: parsed.data.baseUrl,
            });
        } catch (error) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.VALIDATION_ERROR,
                    message: error instanceof Error ? error.message : translateApi('Api.OrganizationAiProviders.LocalAgentUnavailable', undefined, locale),
                }),
                { status: 400 },
            );
        }
    }

    await db.organizationAiProviders.create({
        organizationId,
        createdByUserId: userId,
        updatedByUserId: userId,
        provider: parsed.data.provider,
        model: parsed.data.model,
        baseUrl: parsed.data.baseUrl,
        apiKey: parsed.data.apiKey,
        enabled: true,
        isDefault: false,
    });

    return NextResponse.json(
        ResponseUtil.success(
            await buildOrganizationAiProvidersPayloadForRequest({
                db,
                organizationId,
                canManage: true,
                entitlementMode: entitlement.entitlementMode,
                billingPlan: entitlement.billingPlan,
            }),
        ),
    );
});
