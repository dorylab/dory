import { redirect } from 'next/navigation';

export default async function QueryInsightsRootPage({ params }: { params: Promise<{ team: string; connectionId: string }> }) {
    const { team, connectionId } = await params;
    console.log('Redirecting to monitoring overview page', { team, connectionId });
    redirect(`/${team}/${connectionId}/monitoring/overview`);
}
