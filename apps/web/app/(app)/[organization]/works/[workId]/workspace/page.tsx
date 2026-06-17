import { WorkWorkspacePageClient } from './page.client';

export default async function WorkWorkspacePage({ params }: { params: Promise<{ organization: string; workId: string }> }) {
    const { organization, workId } = await params;
    return <WorkWorkspacePageClient organization={organization} workId={workId} />;
}
