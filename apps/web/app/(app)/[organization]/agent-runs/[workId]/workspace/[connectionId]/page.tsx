import { cookies } from 'next/headers';

import AgentWorkspaceClient from '../../../../[connectionId]/sql-console/agent-workspace-client';
import SqlConsoleLayout from '../../../../[connectionId]/sql-console/layout';

export default async function AgentRunWorkspacePage({
    params,
}: {
    params: Promise<{
        organization: string;
        workId: string;
        connectionId: string;
    }>;
}) {
    const { organization, workId, connectionId } = await params;
    const layout = (await cookies()).get('react-resizable-panels:layout');

    let defaultLayout;
    if (layout) {
        defaultLayout = JSON.parse(layout.value);
    }

    return (
        <SqlConsoleLayout>
            <AgentWorkspaceClient defaultLayout={defaultLayout} organization={organization} workId={workId} connectionId={connectionId} />
        </SqlConsoleLayout>
    );
}
