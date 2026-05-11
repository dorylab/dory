import { pgTable, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { newEntityId } from '@dory/shared/id';
import { user } from '../auth-schema';
import { organizations } from './organizations';

// Can be exported separately for app use
export type OrganizationMemberRole = 'owner' | 'admin' | 'member' | 'viewer';
export type OrganizationMemberStatus = 'active' | 'invited' | 'disabled';

export const organizationMembers = pgTable(
    'members',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),

        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),

        organizationId: text('organization_id')
            .notNull()
            .references(() => organizations.id, { onDelete: 'cascade' }),

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
        uniqueIndex('members_organization_id_user_id_unique').on(table.organizationId, table.userId),
        index('idx_members_organization').on(table.organizationId),
        index('idx_members_user').on(table.userId),
    ],
);
