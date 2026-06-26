import { cookies } from 'next/headers';

import AgentWorkspaceClient from '@/app/(app)/[organization]/[connectionId]/sql-console/agent-workspace-client';
import SqlConsoleLayout from '@/app/(app)/[organization]/[connectionId]/sql-console/layout';
import { buildAgentRunDetailPath } from '@/lib/agent-runs/workspace-url';
import { AgentWorkspaceDrawer } from './agent-workspace-drawer';

export async function AgentWorkspaceDrawerPage({ organization, workId, connectionId }: { organization: string; workId: string; connectionId: string }) {
    const layout = (await cookies()).get('react-resizable-panels:layout');

    let defaultLayout;
    if (layout) {
        defaultLayout = JSON.parse(layout.value);
    }

    return (
        <AgentWorkspaceDrawer closeHref={buildAgentRunDetailPath(organization, workId)}>
            <SqlConsoleLayout>
                <AgentWorkspaceClient defaultLayout={defaultLayout} organization={organization} workId={workId} connectionId={connectionId} />
            </SqlConsoleLayout>
        </AgentWorkspaceDrawer>
    );
}
