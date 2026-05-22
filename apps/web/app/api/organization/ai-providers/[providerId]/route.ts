import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withManagedOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { buildOrganizationAiProvidersPayload } from '@dory/ee/ai/organization-ai-provider-payload';
import {
    resolveOrganizationAiProviderCapabilityForOrganization,
    getOrganizationAiProviderEntitlementModeForServer,
    isGlobalAiProviderConfiguredFromEnv,
    isOrganizationAiProviderConfigured,
} from '@dory/ee/ai/organization-ai-providers';
import { isAiProviderApiKeyRequired, isAiProviderAvailable, isAiProviderBaseUrlRequired, isAiProviderModelAllowed } from '@dory/ee/ai/provider-options';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@dory/shared/errors';
import { ORGANIZATION_AI_PROVIDERS } from '@dory/database/postgres/impl/organization-ai-providers';

export const runtime = 'nodejs';

const patchSchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('set_default'),
    }),
    z.object({
        action: z.literal('set_enabled'),
        enabled: z.boolean(),
    }),
    z.object({
        action: z.literal('update'),
        provider: z.enum(ORGANIZATION_AI_PROVIDERS).default('openai'),
        model: z.string().trim().min(1).max(120),
        baseUrl: z.string().trim().max(500).optional().nullable(),
        apiKey: z.string().trim().max(2000).optional().nullable(),
    }),
]);

type RouteContext = {
    params: Promise<{ providerId: string }>;
};

export function PATCH(req: NextRequest, context: RouteContext) {
    return withManagedOrganizationHandler(async ({ db, organizationId, userId }) => {
        const locale = await getApiLocale();
        const { providerId } = await context.params;
        const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));

        if (!parsed.success) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.VALIDATION_ERROR,
                    message: parsed.error.issues[0]?.message ?? translateApi('Api.Errors.InvalidParams', undefined, locale),
                }),
                { status: 400 },
            );
        }

        const capability = await resolveOrganizationAiProviderCapabilityForOrganization(db, organizationId, getOrganizationAiProviderEntitlementModeForServer());
        if (!capability.enabled) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.FORBIDDEN,
                    message: translateApi('Api.OrganizationAiProviders.OrganizationProviderUnavailableInOss', undefined, locale),
                }),
                { status: 403 },
            );
        }

        if (providerId === 'system') {
            if (parsed.data.action !== 'set_default') {
                return NextResponse.json(
                    ResponseUtil.error({
                        code: ErrorCodes.VALIDATION_ERROR,
                        message: translateApi('Api.OrganizationAiProviders.SystemProviderReadOnly', undefined, locale),
                    }),
                    { status: 400 },
                );
            }

            if (!isGlobalAiProviderConfiguredFromEnv()) {
                return NextResponse.json(
                    ResponseUtil.error({
                        code: ErrorCodes.VALIDATION_ERROR,
                        message: translateApi('Api.OrganizationAiProviders.SystemProviderUnavailable', undefined, locale),
                    }),
                    { status: 400 },
                );
            }

            await db.organizationAiProviders.clearDefault(organizationId);
        } else {
            const provider = await db.organizationAiProviders.get(organizationId, providerId);
            if (!provider) {
                return NextResponse.json(
                    ResponseUtil.error({
                        code: ErrorCodes.NOT_FOUND,
                        message: translateApi('Api.OrganizationAiProviders.ProviderNotFound', undefined, locale),
                    }),
                    { status: 404 },
                );
            }

            if (parsed.data.action === 'set_default') {
                if (!isOrganizationAiProviderConfigured(provider)) {
                    return NextResponse.json(
                        ResponseUtil.error({
                            code: ErrorCodes.VALIDATION_ERROR,
                            message: translateApi('Api.OrganizationAiProviders.ProviderIncomplete', undefined, locale),
                        }),
                        { status: 400 },
                    );
                }

                await db.organizationAiProviders.update({
                    organizationId,
                    id: providerId,
                    isDefault: true,
                    enabled: true,
                    updatedByUserId: userId,
                });
            }

            if (parsed.data.action === 'set_enabled') {
                await db.organizationAiProviders.update({
                    organizationId,
                    id: providerId,
                    enabled: parsed.data.enabled,
                    updatedByUserId: userId,
                });
            }

            if (parsed.data.action === 'update') {
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

                const keepsExistingKey = !parsed.data.apiKey && provider.hasKey;
                const nextHasKey = Boolean(parsed.data.apiKey) || provider.hasKey;
                if (isAiProviderBaseUrlRequired(parsed.data.provider) && !parsed.data.baseUrl) {
                    return NextResponse.json(
                        ResponseUtil.error({
                            code: ErrorCodes.VALIDATION_ERROR,
                            message: translateApi('Api.OrganizationAiProviders.BaseUrlRequired', undefined, locale),
                        }),
                        { status: 400 },
                    );
                }

                if (isAiProviderApiKeyRequired(parsed.data.provider) && !nextHasKey) {
                    return NextResponse.json(
                        ResponseUtil.error({
                            code: ErrorCodes.VALIDATION_ERROR,
                            message: translateApi('Api.OrganizationAiProviders.ApiKeyRequired', undefined, locale),
                        }),
                        { status: 400 },
                    );
                }

                await db.organizationAiProviders.update({
                    organizationId,
                    id: providerId,
                    updatedByUserId: userId,
                    provider: parsed.data.provider,
                    model: parsed.data.model,
                    baseUrl: parsed.data.baseUrl,
                    apiKey: keepsExistingKey ? undefined : parsed.data.apiKey,
                });
            }
        }

        return NextResponse.json(
            ResponseUtil.success(
                await buildOrganizationAiProvidersPayload({
                    db,
                    organizationId,
                    canManage: true,
                }),
            ),
        );
    })(req);
}

export function DELETE(req: NextRequest, context: RouteContext) {
    return withManagedOrganizationHandler(async ({ db, organizationId }) => {
        const locale = await getApiLocale();
        const { providerId } = await context.params;
        const capability = await resolveOrganizationAiProviderCapabilityForOrganization(db, organizationId, getOrganizationAiProviderEntitlementModeForServer());
        if (!capability.enabled) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.FORBIDDEN,
                    message: translateApi('Api.OrganizationAiProviders.OrganizationProviderUnavailableInOss', undefined, locale),
                }),
                { status: 403 },
            );
        }

        if (providerId === 'system') {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.VALIDATION_ERROR,
                    message: translateApi('Api.OrganizationAiProviders.SystemProviderReadOnly', undefined, locale),
                }),
                { status: 400 },
            );
        }

        const deleted = await db.organizationAiProviders.delete(organizationId, providerId);
        if (!deleted) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.NOT_FOUND,
                    message: translateApi('Api.OrganizationAiProviders.ProviderNotFound', undefined, locale),
                }),
                { status: 404 },
            );
        }

        return NextResponse.json(
            ResponseUtil.success(
                await buildOrganizationAiProvidersPayload({
                    db,
                    organizationId,
                    canManage: true,
                }),
            ),
        );
    })(req);
}
