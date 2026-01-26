import { pgTable, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { newEntityId } from '@/lib/id';
import { teams, user } from '..';


// Can be exported separately for app use
export type TeamMemberRole = 'owner' | 'admin' | 'member' | 'viewer';
export type TeamMemberStatus = 'active' | 'invited' | 'disabled';

export const teamMembers = pgTable(
    'team_members',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),

        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),

        teamId: text('team_id')
            .notNull()
            .references(() => teams.id, { onDelete: 'cascade' }),

        // Role: merged definitions, with viewer added
        role: text('role').$type<TeamMemberRole>().notNull().default('member'),

        // Member status: active / invited / disabled
        status: text('status').$type<TeamMemberStatus>().notNull().default('active'),

        // Record creation time
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

        // Actual team join time (useful for stats)
        joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        uniqueIndex('team_members_team_id_user_id_unique').on(table.teamId, table.userId),
        index('idx_team_members_team').on(table.teamId),
        index('idx_team_members_user').on(table.userId),
    ]
);
