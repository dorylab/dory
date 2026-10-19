import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { newEntityId } from '@dory/shared/id';

export type FindingPresentation = {
    metricLabel?: string;
    metricValue?: string;
    metricUnit?: string;
    timeframe?: string;
    dimensions?: string[];
    facts?: Array<{ label: string; value: string }>;
};

export const findings = pgTable(
    'findings',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `finding_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        workId: text('work_id').notNull(),
        title: text('title').notNull(),
        content: text('content'),
        presentation: jsonb('presentation').$type<FindingPresentation | null>(),
        isPrimary: boolean('is_primary').notNull().default(false),
        verifiedAt: timestamp('verified_at', { withTimezone: true }),
        verifiedByUserId: text('verified_by_user_id'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        index('idx_findings_org_work_created').on(table.organizationId, table.workId, table.createdAt),
        uniqueIndex('uidx_findings_primary_per_work').on(table.organizationId, table.workId).where(sql`${table.isPrimary}`),
    ],
);

export const findingArtifacts = pgTable(
    'finding_artifacts',
    {
        findingId: text('finding_id').notNull(),
        artifactId: text('artifact_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        primaryKey({ name: 'pk_finding_artifacts', columns: [table.findingId, table.artifactId] }),
        index('idx_finding_artifacts_artifact').on(table.artifactId),
    ],
);

export type Finding = typeof findings.$inferSelect;
