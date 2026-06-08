import { WorkDetailPageClient } from './page.client';

export default async function WorkDetailPage({ params }: { params: Promise<{ organization: string; workId: string }> }) {
    const { organization, workId } = await params;
    return <WorkDetailPageClient organization={organization} workId={workId} />;
}
