import { redirect } from 'next/navigation';

export default async function QueryInsightsRootPage({ params }: { params: Promise<{ organization: string; connectionId: string }> }) {
    const { organization, connectionId } = await params;
    console.log('Redirecting to monitoring overview page', { organization, connectionId });
    redirect(`/${organization}/${connectionId}/monitoring/overview`);
}
