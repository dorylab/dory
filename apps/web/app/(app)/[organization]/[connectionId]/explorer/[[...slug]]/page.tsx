import { ExplorerPage } from '@/components/explorer/explorer-page';

type ExplorerCatchAllPageProps = {
    params: Promise<{
        organization: string;
        connectionId: string;
        slug?: string[];
    }>;
};

export default async function ExplorerCatchAllPage({ params }: ExplorerCatchAllPageProps) {
    const { organization, connectionId, slug } = await params;

    return (
        <ExplorerPage
            organization={organization}
            connectionId={connectionId}
            slug={slug}
        />
    );
}
