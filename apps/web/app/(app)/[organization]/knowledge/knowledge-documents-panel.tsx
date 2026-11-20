'use client';

import { useQuery } from '@tanstack/react-query';
import { executeActionClient } from '@/lib/actions/client';
import { DocumentBrowser, type BrowserWorkspace } from './document-browser';
import type { DirectoryData } from './document-directory';
import type { KnowledgeModelView } from './knowledge-page.client';
import type { KnowledgeSourceSummary } from './knowledge-sources-panel';

export function KnowledgeDocumentsPanel({
    model,
    organization,
    sources,
    sourcesPending,
    sourcesError,
    workspace,
    children,
}: {
    model: KnowledgeModelView;
    organization: string;
    sources: KnowledgeSourceSummary[];
    sourcesPending: boolean;
    sourcesError?: string;
    workspace: BrowserWorkspace;
    children: React.ReactNode;
}) {
    const directory = useQuery({
        queryKey: ['knowledge-model', model.id, 'directory'],
        queryFn: () => executeActionClient<DirectoryData>('knowledge.listDirectory', { knowledgeModelId: model.id }, { organizationId: organization }),
        refetchInterval: 15_000,
    });
    return (
        <DocumentBrowser
            key={model.id}
            workspace={workspace}
            alternate={children}
            model={model}
            organization={organization}
            sources={sources}
            sourcesPending={sourcesPending}
            sourcesError={sourcesError}
            directory={directory.data}
            directoryPending={directory.isPending}
            directoryError={directory.error?.message}
        />
    );
}
