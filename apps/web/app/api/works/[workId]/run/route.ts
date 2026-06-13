import 'server-only';

import type { NextRequest } from 'next/server';

import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { runWorkAgent } from '@/lib/server/work/run-agent';
import { createValidatedWorkspaceSnapshot, workRunRequestBodySchema, WorkspaceSnapshotRequestError } from '@/lib/server/work/workspace-snapshot';

export const runtime = 'nodejs';

export const POST = withUserAndOrganizationHandler(async ({ req, db, organizationId, userId }) => {
    const runReq = req.clone() as NextRequest;
    const { pathname } = new URL(req.url);
    const parts = pathname.split('/').filter(Boolean);
    const workId = parts[parts.length - 2];

    if (!workId) {
        return Response.json({ error: 'Missing work id.' }, { status: 400 });
    }

    let workspaceSnapshotId: string | null = null;
    let focusInvestigationId: string | null = null;
    let mode: 'run' | 'continue_work' | 'revise_analysis' | 'update_conclusion' | 'rerun_from_scratch' = 'run';
    let userInstruction: string | null = null;
    const text = await req.text();
    if (text.trim()) {
        let body: unknown;
        try {
            body = JSON.parse(text);
        } catch {
            return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
        }

        const parsed = workRunRequestBodySchema.safeParse(body);
        if (!parsed.success) {
            return Response.json({ error: 'Invalid work run request.', details: parsed.error.flatten() }, { status: 400 });
        }

        const workspaceSnapshot = parsed.data?.workspaceSnapshot;
        mode = parsed.data?.mode ?? 'run';
        userInstruction = parsed.data?.userInstruction ?? null;
        focusInvestigationId = parsed.data?.focusInvestigationId ?? null;
        if (workspaceSnapshot) {
            const existingRunningRun = await db.works.getRunningRun({ organizationId, workId });
            if (existingRunningRun) {
                return Response.json(
                    {
                        error: 'Work already has a running run.',
                        run: existingRunningRun,
                    },
                    {
                        status: 409,
                        headers: {
                            'x-work-run-id': existingRunningRun.id,
                        },
                    },
                );
            }

            try {
                const snapshot = await createValidatedWorkspaceSnapshot({
                    db,
                    organizationId,
                    userId,
                    workId,
                    snapshot: workspaceSnapshot,
                });
                workspaceSnapshotId = snapshot.id;
            } catch (error) {
                if (error instanceof WorkspaceSnapshotRequestError) {
                    return Response.json({ error: error.message }, { status: error.status });
                }
                throw error;
            }
        }
    }

    return runWorkAgent({
        req: runReq,
        db,
        organizationId,
        userId,
        workId,
        workspaceSnapshotId,
        focusInvestigationId,
        mode,
        userInstruction,
    });
});
