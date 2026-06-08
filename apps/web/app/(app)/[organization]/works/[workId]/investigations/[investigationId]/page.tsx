import { cookies } from 'next/headers';
import { WorkInvestigationWorkspacePageClient } from './page.client';

export default async function WorkInvestigationWorkspacePage({
    params,
}: {
    params: Promise<{ organization: string; workId: string; investigationId: string }>;
}) {
    const { organization, workId, investigationId } = await params;
    const layout = (await cookies()).get('react-resizable-panels:layout');
    const defaultLayout = layout ? JSON.parse(layout.value) : undefined;

    return <WorkInvestigationWorkspacePageClient organization={organization} workId={workId} investigationId={investigationId} defaultLayout={defaultLayout} />;
}
