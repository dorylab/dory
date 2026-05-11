// db/schema/organizations.ts
import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { newEntityId } from '@dory/shared/id';
import { user } from '../auth-schema';

export type OrganizationProvisioningKind = 'anonymous' | 'system_default' | 'manual' | 'anonymous_promoted';

export const organizations = pgTable(
    'organizations',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()), // uuid
        name: text('name').notNull(), // e.g. "Personal space" / "cat's workspace"

        // Owner
        ownerUserId: text('owner_user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'restrict' }),

        // URL /organization/:slug
        slug: text('slug'),
        provisioningKind: text('provisioning_kind').$type<OrganizationProvisioningKind>(),
        logo: text('logo'),
        metadata: text('metadata'),
        stripeCustomerId: text('stripe_customer_id'),

        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        // Ensure slug is globally unique
        uniqueIndex('organizations_slug_unique').on(table.slug),
    ],
);
