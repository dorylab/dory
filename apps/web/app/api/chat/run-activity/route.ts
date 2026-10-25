import { buildAgentWorkspacePath } from '@/lib/agent-runs/workspace-url';

import { withUserAndOrganizationHandler } from '../../utils/with-organization-handler';

export const GET = withUserAndOrganizationHandler(async ({ req, db, userId, organizationId }) => {
    const workId = req.nextUrl.searchParams.get('workId');
    const requestId = req.nextUrl.searchParams.get('requestId');
    if (!workId) return Response.json({ error: 'Missing workId' }, { status: 400 });
    const scope = { organizationId, userId, workId };
    const work = await db.works.getById(scope);
    if (!work) return Response.json({ error: 'Run not found' }, { status: 404 });
    const events = await db.works.listEvents(scope);
    return Response.json(
        {
            work,
            checkpoints: events.find(event => event.toolName === 'chat_checkpoints' && event.inputSummary?.requestId === requestId)?.outputSummary?.state ?? null,
            progress: events.find(event => event.toolName === 'chat_progress' && event.inputSummary?.requestId === requestId)?.outputSummary?.entries ?? [],
            events: events
                .filter(event => !['chat_progress', 'chat_checkpoints'].includes(event.toolName) && (!requestId || event.inputSummary?.requestId === requestId))
                .reverse(),
            runHref: `/${encodeURIComponent(organizationId)}/agent-runs/${encodeURIComponent(workId)}`,
            workspaceHref: work.connectionId ? buildAgentWorkspacePath({ organization: organizationId, workId, connectionId: work.connectionId }) : null,
        },
        { headers: { 'Cache-Control': 'no-store' } },
    );
});
