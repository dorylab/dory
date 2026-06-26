import { AgentWorkspaceDrawerPage } from '@/components/agent-runs/agent-workspace-drawer-page';

export default async function InterceptedAgentRunWorkspacePage({
    params,
}: {
    params: Promise<{
        organization: string;
        workId: string;
        connectionId: string;
    }>;
}) {
    const { organization, workId, connectionId } = await params;
    return <AgentWorkspaceDrawerPage organization={organization} workId={workId} connectionId={connectionId} />;
}
