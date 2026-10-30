'use client';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { ReportWorkspaceContext } from '@dory/shared/types/report-workspace';
import { ArtifactProvenance } from '@/components/artifacts/artifact-provenance';
import { executeActionClient } from '@/lib/actions/client';
import type { ArtifactDetail } from '@/lib/artifacts/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/registry/new-york-v4/ui/sheet';
export function SourceDetails({
    open,
    onBeforeNavigate,
    onOpenChange,
    context,
    organization,
    organizationId,
}: {
    open: boolean;
    onBeforeNavigate?: () => Promise<boolean>;
    onOpenChange: (open: boolean) => void;
    context: ReportWorkspaceContext;
    organization: string;
    organizationId: string;
}) {
    const router = useRouter();
    const t = useTranslations('WorkDocuments.Workspace');
    const { evidence, reference } = context;
    const details = useQuery({
        queryKey: ['report-workspace-details', organizationId, reference],
        enabled: open,
        retry: false,
        queryFn: ({ signal }) =>
            executeActionClient<{ artifact: ArtifactDetail | null; reports: Array<{ id: string; title: string }> }>('report.workspace.details', reference, {
                organizationId,
                signal,
            }),
    });
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                className="overflow-auto"
                onClickCapture={event => {
                    const link = (event.target as HTMLElement).closest('a');
                    if (!link || !onBeforeNavigate) return;
                    event.preventDefault();
                    event.stopPropagation();
                    void onBeforeNavigate().then(allowed => {
                        if (allowed) router.push(link.getAttribute('href')!);
                    });
                }}
            >
                <SheetHeader>
                    <SheetTitle>{t('Details')}</SheetTitle>
                    <SheetDescription>{evidence.title}</SheetDescription>
                </SheetHeader>
                <div className="grid gap-6 p-4 text-sm">
                    <div>
                        <p className="text-muted-foreground">{t('Source')}</p>
                        <p className="break-all">
                            {evidence.attachmentSource?.files
                                .map(file => file.filename)
                                .filter((file, index, all) => all.indexOf(file) === index)
                                .join(', ') ??
                                evidence.connectionName ??
                                evidence.title}
                        </p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">{t('CapturedAt')}</p>
                        <p>{new Date(evidence.capturedAt).toLocaleString()}</p>
                    </div>
                    {details.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : details.error ? (
                        <p role="alert">{details.error.message}</p>
                    ) : (
                        <>
                            {details.data?.artifact ? (
                                <ArtifactProvenance artifact={details.data.artifact} organization={organization} />
                            ) : (
                                <p className="text-muted-foreground">{t('ArtifactUnavailable')}</p>
                            )}
                            <div className="grid gap-2">
                                <p className="font-medium">{t('RelatedReports')}</p>
                                {details.data?.reports.map(report => (
                                    <Link
                                        key={report.id}
                                        href={`/${encodeURIComponent(organization)}/reports/${encodeURIComponent(report.id)}`}
                                        className="text-primary hover:underline"
                                    >
                                        {report.title}
                                    </Link>
                                ))}
                            </div>
                        </>
                    )}
                    {details.data?.artifact && (
                        <Link href={`/${encodeURIComponent(organization)}/artifacts/${encodeURIComponent(reference.artifactId)}`} className="text-primary hover:underline">
                            {t('ArtifactDetails')}
                        </Link>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
