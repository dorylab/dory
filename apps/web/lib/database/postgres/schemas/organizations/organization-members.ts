import { pgTable, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { newEntityId } from '@/lib/id';


// Can be exported separately for app use
export type OrganizationMemberRole = 'owner' | 'admin' | 'member' | 'viewer';
export type OrganizationMemberStatus = 'active' | 'invited' | 'disabled';

export const organizationMembers = pgTable(
    'organization_members',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),

        userId: text('user_id').notNull(),

        organizationId: text('organization_id').notNull(),

        // Role: merged definitions, with viewer added
        role: text('role').$type<OrganizationMemberRole>().notNull().default('member'),

        // Better Auth treats plugin-managed member metadata as optional.
        status: text('status').$type<OrganizationMemberStatus>(),

        // Record creation time
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

        // Actual organization join time (useful for stats)
        joinedAt: timestamp('joined_at', { withTimezone: true }),
    },
    table => [
        uniqueIndex('organization_members_organization_id_user_id_unique').on(table.organizationId, table.userId),
        index('idx_organization_members_organization').on(table.organizationId),
        index('idx_organization_members_user').on(table.userId),
    ]
);
