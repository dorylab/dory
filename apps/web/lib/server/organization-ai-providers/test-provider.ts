import { generateText } from 'ai';

import type { OrganizationAiProviderType } from '@dory/database/postgres/impl/organization-ai-providers';
import { getChatModelForProviderConfig } from '@/lib/ai/model/providers';

export type OrganizationAiProviderTestInput = {
    provider: OrganizationAiProviderType;
    model: string;
    baseUrl?: string | null;
    apiKey?: string | null;
    organizationId?: string | null;
};

export async function testOrganizationAiProviderConfig(input: OrganizationAiProviderTestInput): Promise<void> {
    const model = getChatModelForProviderConfig({
        providerKey: input.provider,
        modelName: input.model,
        apiKey: input.apiKey,
        baseURL: input.baseUrl,
        organizationId: input.organizationId,
    });

    await generateText({
        model,
        prompt: 'Reply with OK only.',
        temperature: 0,
        maxOutputTokens: 8,
        maxRetries: 0,
        timeout: 15_000,
    });
}

export function getOrganizationAiProviderTestErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error.trim()) return error.trim();
    return 'Provider test failed';
}
