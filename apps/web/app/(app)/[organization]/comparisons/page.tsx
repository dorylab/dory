import { ComparisonsPageClient } from './comparisons-page.client';

export default async function ComparisonsPage({ params }: { params: Promise<{ organization: string }> }) {
    const { organization } = await params;
    return <ComparisonsPageClient organization={organization} />;
}
