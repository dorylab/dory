import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { newEntityId } from '@dory/shared/id';

export const organizationAiProviders = pgTable(
    'organization_ai_providers',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        organizationId: text('organization_id').notNull(),
        provider: text('provider').notNull(),
        model: text('model').notNull(),
        baseUrl: text('base_url'),
        apiKeyEncrypted: text('api_key_encrypted'),
        keyHint: text('key_hint'),
        enabled: boolean('enabled').notNull().default(true),
        isDefault: boolean('is_default').notNull().default(false),
        createdByUserId: text('created_by_user_id'),
        updatedByUserId: text('updated_by_user_id'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .$onUpdateFn(() => new Date()),
    },
    table => [
        index('idx_organization_ai_providers_org').on(table.organizationId),
        index('idx_organization_ai_providers_org_enabled').on(table.organizationId, table.enabled),
        uniqueIndex('uniq_organization_ai_provider_default')
            .on(table.organizationId)
            .where(sql`${table.isDefault} = true`),
    ],
);

export type OrganizationAiProvider = typeof organizationAiProviders.$inferSelect;
export type NewOrganizationAiProvider = typeof organizationAiProviders.$inferInsert;
