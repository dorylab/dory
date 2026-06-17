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
    WorkInvestigationWorkspaceDirtyState as WorkWorkspaceDirtyState,
    WorkInvestigationWorkspaceSnapshotController as WorkWorkspaceSnapshotController,
    WorkInvestigationWorkspaceSnapshotInput as WorkWorkspaceSnapshotInput,
};

export default function WorkSQLConsoleClient({
    defaultLayout,
    connectionId,
    workId,
    preferredActiveTabId,
    expectExistingTabs,
    onWorkspaceDirtyStateChange,
    onWorkspaceSnapshotControllerChange,
}: {
    defaultLayout?: number[];
    connectionId: string;
    workId: string;
    preferredActiveTabId?: string | null;
    expectExistingTabs?: boolean;
    onWorkspaceDirtyStateChange?: (state: WorkInvestigationWorkspaceDirtyState) => void;
    onWorkspaceSnapshotControllerChange?: (controller: WorkInvestigationWorkspaceSnapshotController | null) => void;
}) {
    const runtime = useSqlConsoleClient(defaultLayout, {
        connectionId,
        preferredActiveTabId,
        workspaceScope: {
            type: 'work',
            workId,
        },
    });

    useWorkRunResultHydration({
        activeTab: runtime.activeTab,
        isLoading: runtime.isLoading,
    });

    useWorkInvestigationWorkspaceSnapshotBridge({
        runtime,
        workId,
        intent: 'continue_from_workspace',
        linkedTabId: preferredActiveTabId,
        onWorkspaceDirtyStateChange,
        onWorkspaceSnapshotControllerChange,
    });

    return <SQLConsoleView runtime={runtime} expectExistingTabs={expectExistingTabs} autoSelectLatestResultOnInitialLoad />;
}
