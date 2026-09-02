import { index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

import { newEntityId } from '@dory/shared/id';

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
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [index('idx_findings_org_work_created').on(table.organizationId, table.workId, table.createdAt)],
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
