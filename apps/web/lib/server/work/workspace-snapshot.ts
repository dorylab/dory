import 'server-only';

import { z } from 'zod';
import type { DBService } from '@dory/database';
import type { WorkWorkspaceSnapshot, WorkWorkspaceSnapshotHumanEdits } from '@dory/database/postgres/schemas';

const changeSummarySchema = z.object({
    sqlEdited: z.boolean().optional(),
    resultRefreshed: z.boolean().optional(),
    chartConfigChanged: z.boolean().optional(),
    selectedRowsChanged: z.boolean().optional(),
});

const humanEditsSchema = z.object({
    sql: z.string().nullable().optional(),
    resultPreview: z.record(z.string(), z.unknown()).nullable().optional(),
    chartConfig: z.record(z.string(), z.unknown()).nullable().optional(),
    selectedRows: z.record(z.string(), z.unknown()).nullable().optional(),
    userNote: z.string().nullable().optional(),
    changeSummary: changeSummarySchema.nullable().optional(),
});

export const workspaceSnapshotInputSchema = z.object({
    investigationId: z.string().min(1),
    workspaceId: z.string().min(1),
    previousAgentStepId: z.string().min(1).nullable().optional(),
    intent: z.literal('continue_analysis'),
    humanEdits: humanEditsSchema,
});

export const workRunRequestBodySchema = z
    .object({
        workspaceSnapshot: workspaceSnapshotInputSchema.optional(),
    })
    .optional();

export class WorkspaceSnapshotRequestError extends Error {
    readonly status: number;

    constructor(message: string, status = 400) {
        super(message);
        this.name = 'WorkspaceSnapshotRequestError';
        this.status = status;
    }
}

function boundedString(value: string | null | undefined, maxLength: number) {
    if (typeof value !== 'string') return value ?? null;
    return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function boundedRecord(value: Record<string, unknown> | null | undefined, maxLength: number) {
    if (!value) return null;
    try {
        const serialized = JSON.stringify(value);
        if (serialized.length <= maxLength) return value;
        return {
            truncated: true,
            preview: serialized.slice(0, maxLength),
        };
    } catch {
        return {
            value: String(value),
        };
    }
}

function sanitizeHumanEdits(edits: z.infer<typeof humanEditsSchema>): WorkWorkspaceSnapshotHumanEdits {
    return {
        sql: boundedString(edits.sql, 50000),
        resultPreview: boundedRecord(edits.resultPreview, 100000),
        chartConfig: boundedRecord(edits.chartConfig, 20000),
        selectedRows: boundedRecord(edits.selectedRows, 40000),
        userNote: boundedString(edits.userNote, 5000),
        changeSummary: edits.changeSummary ?? null,
    };
}

export async function createValidatedWorkspaceSnapshot(input: {
    db: DBService;
    organizationId: string;
    userId: string;
    workId: string;
    snapshot: z.infer<typeof workspaceSnapshotInputSchema>;
}): Promise<WorkWorkspaceSnapshot> {
    const work = await input.db.works.getById({ organizationId: input.organizationId, id: input.workId });
    if (!work) throw new WorkspaceSnapshotRequestError('Work not found.', 404);

    const investigation = await input.db.works.getInvestigationById({
        organizationId: input.organizationId,
        workId: work.id,
        id: input.snapshot.investigationId,
    });
    if (!investigation) throw new WorkspaceSnapshotRequestError('Work investigation not found.', 404);

    const tab = await input.db.tabState.loadTabState(input.snapshot.workspaceId, input.userId, work.connectionId, {
        type: 'work_investigation',
        workId: work.id,
        investigationId: investigation.id,
    });
    if (!tab) throw new WorkspaceSnapshotRequestError('Workspace tab not found for this investigation.', 400);

    if (input.snapshot.previousAgentStepId) {
        const previousEvent = await input.db.works.getRunEventById({
            organizationId: input.organizationId,
            workId: work.id,
            id: input.snapshot.previousAgentStepId,
        });
        if (!previousEvent) throw new WorkspaceSnapshotRequestError('Previous Agent step not found.', 400);
    }

    return input.db.works.createWorkspaceSnapshot({
        organizationId: input.organizationId,
        workId: work.id,
        investigationId: investigation.id,
        workspaceId: input.snapshot.workspaceId,
        previousAgentStepId: input.snapshot.previousAgentStepId ?? null,
        intent: input.snapshot.intent,
        humanEdits: sanitizeHumanEdits(input.snapshot.humanEdits),
        createdByUserId: input.userId,
    });
}

export function formatWorkspaceSnapshotForAgent(snapshot: WorkWorkspaceSnapshot | null) {
    if (!snapshot) return null;

    const edits = snapshot.humanEdits ?? {};
    const resultPreview = edits.resultPreview ? JSON.stringify(edits.resultPreview, null, 2) : 'No refreshed result preview was provided.';
    const chartConfig = edits.chartConfig ? JSON.stringify(edits.chartConfig, null, 2) : 'No chart configuration was provided.';
    const selectedRows = edits.selectedRows ? JSON.stringify(edits.selectedRows, null, 2) : 'No selected rows were provided.';
    const note = edits.userNote?.trim() || 'No human note was provided.';

    return [
        'The human reviewed and modified your workspace.',
        '',
        `Work ID: ${snapshot.workId}`,
        `Investigation ID: ${snapshot.investigationId}`,
        `Workspace ID: ${snapshot.workspaceId}`,
        snapshot.previousAgentStepId ? `Previous Agent step ID: ${snapshot.previousAgentStepId}` : null,
        '',
        'Updated SQL:',
        edits.sql?.trim() || 'No SQL was provided.',
        '',
        'Latest result summary:',
        resultPreview,
        '',
        'Chart config:',
        chartConfig,
        '',
        'Selected rows:',
        selectedRows,
        '',
        'Human note:',
        note,
        '',
        'Continue the investigation from this updated state. Do not revert to an older SQL query unless the human explicitly asks you to.',
    ]
        .filter((line): line is string => line !== null)
        .join('\n');
}
