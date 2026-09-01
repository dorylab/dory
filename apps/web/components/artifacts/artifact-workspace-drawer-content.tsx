'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import AgentWorkspaceClient from '@/app/(app)/[organization]/[connectionId]/sql-console/agent-workspace-client';
import SQLConsoleClient from '@/app/(app)/[organization]/[connectionId]/sql-console/client';
import type { SqlWorkspaceInitialResultTarget } from '@/app/(app)/[organization]/[connectionId]/sql-console/initial-result-target';
import type { SqlWorkspaceScope } from '@/app/(app)/[organization]/[connectionId]/sql-console/workspace-scope';
import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { executeActionClient } from '@/lib/actions/client';
import type { ArtifactDetail } from '@/lib/artifacts/types';

export function ArtifactWorkspaceDrawerContent({
    artifactId,
    connectionId,
    organization,
    defaultLayout,
    maxFileBytes,
}: {
    artifactId: string;
    connectionId: string;
    organization: string;
    defaultLayout?: number[];
    maxFileBytes: number;
}) {
    const t = useTranslations('Artifacts.WorkspaceDrawer');
    const organizationId = useOrganizationId();
    const artifactWorkspaceScope = useMemo<SqlWorkspaceScope>(() => ({ workspaceMode: 'artifact', artifactId, connectionId }), [artifactId, connectionId]);
    const query = useQuery({
        queryKey: ['artifact', organizationId, artifactId],
        queryFn: () => executeActionClient<ArtifactDetail>('artifact.get', { artifactId }, { organizationId }),
    });

    if (query.isLoading) {
        return (
            <div className="flex h-full items-center justify-center bg-card text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('Loading')}
            </div>
        );
    }

    const artifact = query.data;
    const target = artifact?.workspaceTarget;
    if (query.isError || !artifact || !target || target.connectionId !== connectionId) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-card px-6 text-center text-sm text-muted-foreground">
                <AlertCircle className="h-6 w-6" />
                <p>{query.error instanceof Error ? query.error.message : t('Unavailable')}</p>
            </div>
        );
    }

    const initialResultTarget: SqlWorkspaceInitialResultTarget = {
        tabId: target.tabId,
        sessionId: target.sessionId,
        setIndex: target.setIndex,
        sql: target.sql,
        title: artifact.title,
    };

    if (target.mode === 'agent') {
        return (
            <AgentWorkspaceClient
                defaultLayout={defaultLayout}
                organization={organization}
                workId={target.workId}
                connectionId={target.connectionId}
                initialResultTarget={initialResultTarget}
            />
        );
    }

    return <SQLConsoleClient defaultLayout={defaultLayout} maxFileBytes={maxFileBytes} initialResultTarget={initialResultTarget} workspaceScope={artifactWorkspaceScope} />;
}
