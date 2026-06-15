'use client';

import { SQLConsoleView } from './client';
import { useSqlConsoleClient } from './hooks/useSqlConsoleClient';
import { useWorkRunResultHydration } from './hooks/useWorkRunResultHydration';
import {
    useWorkInvestigationWorkspaceSnapshotBridge,
    type WorkInvestigationWorkspaceDirtyState,
    type WorkInvestigationWorkspaceSnapshotController,
    type WorkInvestigationWorkspaceSnapshotInput,
} from './hooks/useWorkInvestigationWorkspaceSnapshotBridge';

export type {
    WorkInvestigationWorkspaceDirtyState,
    WorkInvestigationWorkspaceSnapshotController,
    WorkInvestigationWorkspaceSnapshotInput,
};

export default function WorkInvestigationSQLConsoleClient({
    defaultLayout,
    connectionId,
    workId,
    investigationId,
    preferredActiveTabId,
    expectExistingTabs,
    onWorkspaceDirtyStateChange,
    onWorkspaceSnapshotControllerChange,
}: {
    defaultLayout?: number[];
    connectionId: string;
    workId: string;
    investigationId: string;
    preferredActiveTabId?: string | null;
    expectExistingTabs?: boolean;
    onWorkspaceDirtyStateChange?: (state: WorkInvestigationWorkspaceDirtyState) => void;
    onWorkspaceSnapshotControllerChange?: (controller: WorkInvestigationWorkspaceSnapshotController | null) => void;
}) {
    const runtime = useSqlConsoleClient(defaultLayout, {
        connectionId,
        preferredActiveTabId,
        workspaceScope: {
            type: 'work_investigation',
            workId,
            investigationId,
        },
    });

    useWorkRunResultHydration({
        activeTab: runtime.activeTab,
        isLoading: runtime.isLoading,
    });

    useWorkInvestigationWorkspaceSnapshotBridge({
        runtime,
        workId,
        investigationId,
        linkedTabId: preferredActiveTabId,
        onWorkspaceDirtyStateChange,
        onWorkspaceSnapshotControllerChange,
    });

    return <SQLConsoleView runtime={runtime} expectExistingTabs={expectExistingTabs} autoSelectLatestResultOnInitialLoad />;
}
