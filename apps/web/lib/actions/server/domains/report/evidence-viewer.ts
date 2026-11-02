import type { ReportEvidenceInspection, ReportEvidenceRows } from '@dory/shared/types/report-workspace';
import { z } from 'zod';
import { inspectReportEvidence, readReportEvidenceRows } from '@/lib/server/report-evidence';
import { defineWebAction } from '../../define-web-action';
import { readWorkspace } from '../../policies';

const referenceSchema = z.object({
    documentId: z.string().min(1),
    artifactId: z.string().min(1),
    revision: z.number().int().positive(),
    publicationId: z.string().min(1).optional(),
    snapshotId: z.string().min(1).optional(),
});

export const reportEvidenceActions = [
    defineWebAction({
        id: 'report.evidence.inspect',
        domain: 'report',
        kind: 'query',
        risk: 'read',
        permissions: readWorkspace,
        scopes: ['query:read'],
        actors: ['user'],
        inputSchema: referenceSchema,
        outputSchema: z.custom<ReportEvidenceInspection>(),
        handler: inspectReportEvidence,
    }),
    defineWebAction({
        id: 'report.evidence.rows',
        domain: 'report',
        kind: 'query',
        risk: 'read',
        permissions: readWorkspace,
        scopes: ['query:read'],
        actors: ['user'],
        inputSchema: referenceSchema.extend({ offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(25) }),
        outputSchema: z.custom<ReportEvidenceRows>(),
        handler: readReportEvidenceRows,
    }),
    defineWebAction({
        id: 'report.evidence.references',
        domain: 'report',
        kind: 'query',
        risk: 'read',
        permissions: readWorkspace,
        scopes: ['query:read'],
        actors: ['user'],
        inputSchema: z.object({ artifactId: z.string().min(1) }),
        outputSchema: z.array(z.object({ id: z.string(), title: z.string(), revision: z.number().int().positive().optional(), publicationId: z.string().optional() })),
        handler: async (ctx, input) => {
            await ctx.services.db.artifacts.get({ organizationId: ctx.organizationId, userId: ctx.userId, artifactId: input.artifactId });
            return ctx.services.db.workDocuments.listReferencingArtifact({ organizationId: ctx.organizationId, userId: ctx.userId, artifactId: input.artifactId });
        },
    }),
];
