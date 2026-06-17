import 'server-only';

import { z } from 'zod';
import type { DBService } from '@dory/database';
import type { WorkWorkspaceSnapshot, WorkWorkspaceSnapshotHumanEdits } from '@dory/database/postgres/schemas';
import type { TabResultMetaPayload } from '@dory/shared/types/tabs';

type SnapshotTabState = {
    tabType: 'sql' | 'table';
    tabName?: string | null;
    databaseName?: string | null;
    tableName?: string | null;
    orderIndex?: number | null;
    createdAt?: string | Date | null;
    activeSubTab?: 'overview' | 'data' | 'structure' | 'indexes' | 'stats' | null;
    content?: string | null;
    resultMeta?: TabResultMetaPayload | null;
};

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
    investigationId: z.string().min(1).optional(),
    workspaceId: z.string().min(1),
    focusTabId: z.string().min(1).nullable().optional(),
    previousAgentStepId: z.string().min(1).nullable().optional(),
    intent: z.enum(['continue_analysis', 'continue_from_workspace', 'continue_from_tab']),
    humanEdits: humanEditsSchema,
});

export const workRunRequestBodySchema = z
    .object({
        mode: z.enum(['run', 'continue_work', 'revise_analysis', 'update_conclusion', 'rerun_from_scratch']).optional(),
        userInstruction: z.string().trim().min(1).max(5000).optional(),
        workspaceSnapshot: workspaceSnapshotInputSchema.optional(),
        focusInvestigationId: z.string().min(1).optional(),
        focusTabId: z.string().min(1).optional(),
        trigger: z.enum(['user_instruction', 'continue_from_workspace', 'continue_from_tab']).optional(),
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

    const isWorkLevelSnapshot = input.snapshot.intent === 'continue_from_workspace' || input.snapshot.intent === 'continue_from_tab';
    const investigation = !isWorkLevelSnapshot
        ? await input.db.works.getInvestigationById({
              organizationId: input.organizationId,
              workId: work.id,
              id: input.snapshot.investigationId ?? '',
          })
        : null;
    if (!isWorkLevelSnapshot && !investigation) throw new WorkspaceSnapshotRequestError('Work investigation not found.', 404);

    const workspaceScope = isWorkLevelSnapshot
        ? ({ type: 'work' as const, workId: work.id })
        : ({ type: 'work_investigation' as const, workId: work.id, investigationId: investigation!.id });
    const tab = await input.db.tabState.loadTabState(input.snapshot.workspaceId, input.userId, work.connectionId, workspaceScope);
    if (!tab) throw new WorkspaceSnapshotRequestError('Workspace tab not found for this Work.', 400);

    if (input.snapshot.previousAgentStepId) {
        const previousEvent = await input.db.works.getRunEventById({
            organizationId: input.organizationId,
            workId: work.id,
            id: input.snapshot.previousAgentStepId,
        });
        if (!previousEvent) throw new WorkspaceSnapshotRequestError('Previous Agent step not found.', 400);
    }

    const snapshot = await input.db.works.createWorkspaceSnapshot({
        organizationId: input.organizationId,
        workId: work.id,
        investigationId: isWorkLevelSnapshot ? work.id : investigation!.id,
        workspaceId: input.snapshot.workspaceId,
        previousAgentStepId: input.snapshot.previousAgentStepId ?? null,
        intent: input.snapshot.intent,
        humanEdits: sanitizeHumanEdits(input.snapshot.humanEdits),
        createdByUserId: input.userId,
    });
    const sanitizedHumanEdits = sanitizeHumanEdits(input.snapshot.humanEdits);

    if (isWorkLevelSnapshot) {
        const tabState = tab as SnapshotTabState;
        await input.db.tabState.saveTabState({
            tabId: input.snapshot.workspaceId,
            userId: input.userId,
            connectionId: work.connectionId,
            workspaceScope,
            state: {
                ...tabState,
                content: sanitizedHumanEdits.sql ?? tabState.content ?? '',
                workSyncState: 'synced',
            },
            resultMeta: tabState.resultMeta ?? null,
        });
    }

    const hasHumanChanges = Object.values(input.snapshot.humanEdits.changeSummary ?? {}).some(Boolean);
    if (!isWorkLevelSnapshot && (input.snapshot.humanEdits.resultPreview || hasHumanChanges)) {
        await input.db.works.updateInvestigation({
            organizationId: input.organizationId,
                workId: work.id,
                id: investigation!.id,
            patch: {
                auditStatus: hasHumanChanges ? 'revised' : undefined,
                lastQueryAt: snapshot.createdAt,
            },
        });
        await input.db.works.createInvestigationRevision({
            organizationId: input.organizationId,
            workId: work.id,
            investigationId: investigation!.id,
            instruction: input.snapshot.humanEdits.userNote ?? null,
            createdBy: 'user',
            markConclusionOutdated: true,
        });
    }

    return snapshot;
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
        snapshot.intent === 'continue_analysis' ? `Investigation ID: ${snapshot.investigationId}` : null,
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
        snapshot.intent === 'continue_analysis'
            ? 'Continue the investigation from this updated state. Do not revert to an older SQL query unless the human explicitly asks you to.'
            : 'Continue the Work from this updated SQL workspace state. Do not revert to older SQL unless the human explicitly asks you to.',
    ]
        .filter((line): line is string => line !== null)
        .join('\n');
}
