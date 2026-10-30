import { ReportWorkspace } from './report-workspace';

export default async function ReportWorkspacePage({
    params,
    searchParams,
    intercepted = false,
}: {
    intercepted?: boolean;
    params: Promise<{ organization: string; documentId: string; artifactId: string }>;
    searchParams: Promise<{ revision?: string; publication?: string; snapshot?: string }>;
}) {
    const [path, query] = await Promise.all([params, searchParams]);
    return (
        <ReportWorkspace
            intercepted={intercepted}
            organization={path.organization}
            reference={{
                documentId: path.documentId,
                artifactId: path.artifactId,
                revision: Number(query.revision),
                publicationId: query.publication,
                snapshotId: query.snapshot,
            }}
        />
    );
}
