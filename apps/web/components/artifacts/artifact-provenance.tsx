'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ArtifactDetail } from '@/lib/artifacts/types';

export function ArtifactProvenance({ artifact, organization }: { artifact: ArtifactDetail; organization: string }) {
    const t = useTranslations('Artifacts.Viewer');
    return (
        <div className="grid content-start gap-4 text-sm">
            <div className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">{t('ProducedBy')}</span>
                {artifact.workId ? (
                    <Link href={`/${encodeURIComponent(organization)}/agent-runs/${encodeURIComponent(artifact.workId)}`} className="text-primary hover:underline">
                        {t('AgentRun', { title: artifact.runTitle ?? artifact.workId })}
                    </Link>
                ) : (
                    <span>{artifact.createdByName ?? artifact.createdByActorType}</span>
                )}
            </div>
            <div className="grid gap-2">
                <span className="text-xs font-medium text-muted-foreground">{t('EvidenceFor')}</span>
                {artifact.usedBy.length ? (
                    artifact.usedBy.map(finding => (
                        <Link
                            key={finding.findingId}
                            href={`/${encodeURIComponent(organization)}/agent-runs/${encodeURIComponent(finding.workId)}?fromArtifact=${encodeURIComponent(artifact.id)}`}
                            className="text-primary hover:underline"
                        >
                            {finding.title}
                        </Link>
                    ))
                ) : (
                    <span className="text-muted-foreground">{t('NoEvidence')}</span>
                )}
            </div>
        </div>
    );
}
