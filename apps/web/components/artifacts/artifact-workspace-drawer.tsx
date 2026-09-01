'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { AgentWorkspaceDrawer } from '@/components/agent-runs/agent-workspace-drawer';
import { executeActionClient } from '@/lib/actions/client';
import type { ArtifactDetail } from '@/lib/artifacts/types';

export function ArtifactWorkspaceDrawer({
    artifactId,
    organization,
    title,
    description,
    closeLabel,
    children,
}: {
    artifactId: string;
    organization: string;
    title: string;
    description: string;
    closeLabel: string;
    children: ReactNode;
}) {
    const t = useTranslations('Artifacts.WorkspaceDrawer');
    const organizationId = useOrganizationId();
    const artifactQuery = useQuery({
        queryKey: ['artifact', organizationId, artifactId],
        queryFn: () => executeActionClient<ArtifactDetail>('artifact.get', { artifactId }, { organizationId }),
    });
    const closeHref = `/${encodeURIComponent(organization)}/artifacts/${encodeURIComponent(artifactId)}`;
    const backLabel = artifactQuery.data?.title ?? t('Back');

    return (
        <AgentWorkspaceDrawer closeHref={closeHref} title={title} description={description} backLabel={backLabel} closeLabel={closeLabel}>
            {children}
        </AgentWorkspaceDrawer>
    );
}
