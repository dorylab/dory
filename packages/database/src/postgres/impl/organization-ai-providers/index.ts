import { and, desc, eq } from 'drizzle-orm';

import { getClient } from '@dory/database/postgres/client';
import { organizationAiProviders } from '@dory/database/schema';
import { translateDatabase } from '@dory/database/i18n';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { decrypt, encrypt } from '@dory/shared';
import type { PostgresDBClient } from '@dory/shared';

export const ORGANIZATION_AI_PROVIDERS = [
    'openai',
    'anthropic',
    'google',
    'qwen',
    'xai',
    'meta',
    'azure-openai',
    'openrouter',
    'openai-compatible',
    'cloudflare',
    'cloudflare-gateway',
] as const;

export type OrganizationAiProviderType = (typeof ORGANIZATION_AI_PROVIDERS)[number];
export type OrganizationAiProviderRecord = typeof organizationAiProviders.$inferSelect;

export type OrganizationAiProviderPublic = {
    id: string;
    organizationId: string;
    provider: OrganizationAiProviderType;
    model: string;
    baseUrl: string | null;
    enabled: boolean;
    isDefault: boolean;
    hasKey: boolean;
    keyHint: string | null;
    createdAt: string | null;
    updatedAt: string | null;
};

export type OrganizationAiProviderResolved = OrganizationAiProviderPublic & {
    apiKey: string | null;
};

export type OrganizationAiProviderCreateInput = {
    organizationId: string;
    provider: OrganizationAiProviderType;
    model: string;
    baseUrl?: string | null;
    apiKey?: string | null;
    enabled?: boolean;
    isDefault?: boolean;
    createdByUserId?: string | null;
    updatedByUserId?: string | null;
};

export type OrganizationAiProviderUpdateInput = {
    organizationId: string;
    id: string;
    provider?: OrganizationAiProviderType;
    model?: string;
    baseUrl?: string | null;
    apiKey?: string | null;
    enabled?: boolean;
    isDefault?: boolean;
    updatedByUserId?: string | null;
};

function normalizeString(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

export function isOrganizationAiProvider(value: string): value is OrganizationAiProviderType {
    return ORGANIZATION_AI_PROVIDERS.includes(value as OrganizationAiProviderType);
}

export function buildOrganizationAiKeyHint(apiKey: string): string {
    const trimmed = apiKey.trim();
    if (!trimmed) return '';
    if (trimmed.length <= 8) return '*'.repeat(trimmed.length);
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function normalizeProvider(value?: string | null): OrganizationAiProviderType | null {
    const normalized = normalizeString(value)?.toLowerCase() ?? null;
    if (!normalized) return null;
    return isOrganizationAiProvider(normalized) ? normalized : null;
}

export function serializeOrganizationAiProvider(record: OrganizationAiProviderRecord): OrganizationAiProviderPublic {
    const provider = normalizeProvider(record.provider);
    if (!provider) {
        throw new DatabaseError('Saved organization AI provider is not supported', 500);
    }

    return {
        id: record.id,
        organizationId: record.organizationId,
        provider,
        model: normalizeString(record.model) ?? '',
        baseUrl: normalizeString(record.baseUrl),
        enabled: record.enabled,
        isDefault: record.isDefault,
        hasKey: Boolean(record.apiKeyEncrypted),
        keyHint: normalizeString(record.keyHint),
        createdAt: record.createdAt ? record.createdAt.toISOString() : null,
        updatedAt: record.updatedAt ? record.updatedAt.toISOString() : null,
    };
}

export class PostgresOrganizationAiProvidersRepository {
    private db!: PostgresDBClient;

    async init() {
        try {
            this.db = (await getClient()) as PostgresDBClient;
            if (!this.db) {
                throw new DatabaseError(translateDatabase('Database.Errors.ConnectionFailed'), 500);
            }
        } catch (e) {
            console.error(translateDatabase('Database.Logs.InitFailed'), e);
            throw new DatabaseError(translateDatabase('Database.Errors.InitFailed'), 500);
        }
    }

    async list(organizationId: string): Promise<OrganizationAiProviderPublic[]> {
        const rows = await this.db
            .select()
            .from(organizationAiProviders)
            .where(eq(organizationAiProviders.organizationId, organizationId))
            .orderBy(desc(organizationAiProviders.isDefault), desc(organizationAiProviders.updatedAt));

        return rows.map(serializeOrganizationAiProvider);
    }

    async get(organizationId: string, id: string): Promise<OrganizationAiProviderPublic | null> {
        const [record] = await this.db
            .select()
            .from(organizationAiProviders)
            .where(and(eq(organizationAiProviders.organizationId, organizationId), eq(organizationAiProviders.id, id)))
            .limit(1);

        return record ? serializeOrganizationAiProvider(record) : null;
    }

    async getDefault(organizationId: string): Promise<OrganizationAiProviderPublic | null> {
        const [record] = await this.db
            .select()
            .from(organizationAiProviders)
            .where(and(eq(organizationAiProviders.organizationId, organizationId), eq(organizationAiProviders.enabled, true), eq(organizationAiProviders.isDefault, true)))
            .limit(1);

        return record ? serializeOrganizationAiProvider(record) : null;
    }

    async getDefaultResolved(organizationId: string): Promise<OrganizationAiProviderResolved | null> {
        const [record] = await this.db
            .select()
            .from(organizationAiProviders)
            .where(and(eq(organizationAiProviders.organizationId, organizationId), eq(organizationAiProviders.enabled, true), eq(organizationAiProviders.isDefault, true)))
            .limit(1);

        if (!record) return null;

        return {
            ...serializeOrganizationAiProvider(record),
            apiKey: record.apiKeyEncrypted ? await decrypt(record.apiKeyEncrypted) : null,
        };
    }

    async clearDefault(organizationId: string): Promise<void> {
        await this.db.update(organizationAiProviders).set({ isDefault: false, updatedAt: new Date() }).where(eq(organizationAiProviders.organizationId, organizationId));
    }

    async create(input: OrganizationAiProviderCreateInput): Promise<OrganizationAiProviderPublic> {
        const trimmedApiKey = normalizeString(input.apiKey);
        const existingDefault = await this.getDefault(input.organizationId);
        const isDefault = input.isDefault ?? !existingDefault;
        const values = {
            organizationId: input.organizationId,
            provider: input.provider,
            model: normalizeString(input.model) ?? '',
            baseUrl: normalizeString(input.baseUrl),
            apiKeyEncrypted: trimmedApiKey ? await encrypt(trimmedApiKey) : null,
            keyHint: trimmedApiKey ? buildOrganizationAiKeyHint(trimmedApiKey) : null,
            enabled: input.enabled ?? true,
            isDefault,
            createdByUserId: input.createdByUserId ?? input.updatedByUserId ?? null,
            updatedByUserId: input.updatedByUserId ?? input.createdByUserId ?? null,
            updatedAt: new Date(),
        };

        const record = await this.db.transaction(async tx => {
            if (isDefault) {
                await tx.update(organizationAiProviders).set({ isDefault: false, updatedAt: new Date() }).where(eq(organizationAiProviders.organizationId, input.organizationId));
            }

            const [created] = await tx.insert(organizationAiProviders).values(values).returning();
            return created;
        });

        if (!record) {
            throw new DatabaseError('Failed to create organization AI provider', 500);
        }

        return serializeOrganizationAiProvider(record);
    }

    async update(input: OrganizationAiProviderUpdateInput): Promise<OrganizationAiProviderPublic> {
        const [existing] = await this.db
            .select()
            .from(organizationAiProviders)
            .where(and(eq(organizationAiProviders.organizationId, input.organizationId), eq(organizationAiProviders.id, input.id)))
            .limit(1);

        if (!existing) {
            throw new DatabaseError('Organization AI provider not found', 404);
        }

        const trimmedApiKey = normalizeString(input.apiKey);
        const nextEnabled = input.enabled ?? existing.enabled;
        const nextIsDefault = nextEnabled ? (input.isDefault ?? existing.isDefault) : false;
        const values = {
            provider: input.provider ?? normalizeProvider(existing.provider) ?? 'openai',
            model: normalizeString(input.model) ?? normalizeString(existing.model) ?? '',
            baseUrl: input.baseUrl === undefined ? normalizeString(existing.baseUrl) : normalizeString(input.baseUrl),
            apiKeyEncrypted: trimmedApiKey ? await encrypt(trimmedApiKey) : existing.apiKeyEncrypted,
            keyHint: trimmedApiKey ? buildOrganizationAiKeyHint(trimmedApiKey) : existing.keyHint,
            enabled: nextEnabled,
            isDefault: nextIsDefault,
            updatedByUserId: input.updatedByUserId ?? null,
            updatedAt: new Date(),
        };

        const record = await this.db.transaction(async tx => {
            if (nextIsDefault) {
                await tx.update(organizationAiProviders).set({ isDefault: false, updatedAt: new Date() }).where(eq(organizationAiProviders.organizationId, input.organizationId));
            }

            const [updated] = await tx
                .update(organizationAiProviders)
                .set(values)
                .where(and(eq(organizationAiProviders.organizationId, input.organizationId), eq(organizationAiProviders.id, input.id)))
                .returning();
            return updated;
        });

        if (!record) {
            throw new DatabaseError('Failed to update organization AI provider', 500);
        }

        return serializeOrganizationAiProvider(record);
    }

    async delete(organizationId: string, id: string): Promise<boolean> {
        const deleted = await this.db
            .delete(organizationAiProviders)
            .where(and(eq(organizationAiProviders.organizationId, organizationId), eq(organizationAiProviders.id, id)))
            .returning({ id: organizationAiProviders.id });

        return deleted.length > 0;
    }
}
