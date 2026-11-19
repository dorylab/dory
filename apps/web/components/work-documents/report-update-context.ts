'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { ReportResultPointer } from '@dory/shared/types/report-updates';
import type { WorkspaceChartSpec } from '@dory/shared/types/workspace-chart';
import type { QueryExecutePayload } from '@/lib/client/sql-console-query-stream';

export type UpdateNavigation = { tabId: string; title: string; sql: string; result?: ReportResultPointer; chart?: WorkspaceChartSpec };
export type UpdatePanelControls = { navigate: (target: UpdateNavigation) => void; copy: () => Promise<void> };
export const UpdateWorkspaceContext = createContext<{
    workId: string;
    onRestoreTab: (sourceTab: string, tabId: string) => void;
    saveTabs: React.RefObject<(() => Promise<void>) | null>;
    onTabs: (tabs: { tabId: string; title: string; sql: string }[]) => void;
    onRunStart: (tabId: string) => void;
    onEdit: (tabId: string, sql: string) => void;
    onExecution: (payload: QueryExecutePayload, editorSql: string) => void;
    renderPanel: (controls: UpdatePanelControls) => ReactNode;
} | null>(null);
export const useReportUpdates = () => useContext(UpdateWorkspaceContext);
