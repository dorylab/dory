import { ReportRunWorkspace } from './report-run-workspace';
import { ReportWorkspace } from './report-workspace';

export default async function ReportWorkspacePage({
    params,
    searchParams,
    intercepted = false,
}: {
    intercepted?: boolean;
    params: Promise<{ organization: string; documentId: string; artifactId?: string }>;
    searchParams: Promise<{
        revision?: string;
        publication?: string;
        snapshot?: string;
        componentId?: string;
        groupId?: string;
        run?: string;
        connection?: string;
        section?: string;
        history?: string;
        tabId?: string;
    }>;
}) {
    const [path, query] = await Promise.all([params, searchParams]);
    if (query.run && query.connection)
        return (
            <ReportRunWorkspace
                organization={path.organization}
                workId={query.run}
                connectionId={query.connection}
                historical={query.history === '1' || Boolean(query.publication)}
                section={query.section}
                tabId={query.tabId}
                reference={{
                    documentId: path.documentId,
                    revision: Number(query.revision),
                    artifactId: path.artifactId ?? '',
                    componentId: query.componentId,
                    groupId: query.groupId,
                    publicationId: query.publication,
                }}
            />
        );
    return (
        <ReportWorkspace
            intercepted={intercepted}
            organization={path.organization}
            reference={{
                documentId: path.documentId,
                artifactId: path.artifactId ?? '',
                revision: Number(query.revision),
                publicationId: query.publication,
                snapshotId: query.snapshot,
                componentId: query.componentId,
                groupId: query.groupId,
            }}
        />
    );
}
