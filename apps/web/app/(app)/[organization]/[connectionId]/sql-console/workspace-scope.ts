'use client';

import { atom } from 'jotai';

export type SqlWorkspaceMode = 'human' | 'agent' | 'artifact';

export type SqlWorkspaceScope = {
    workspaceMode: SqlWorkspaceMode;
    connectionId?: string | null;
    workId?: string | null;
    artifactId?: string | null;
};

export const humanSqlWorkspaceScope: SqlWorkspaceScope = {
    workspaceMode: 'human',
    workId: null,
};

export const sqlWorkspaceScopeAtom = atom<SqlWorkspaceScope>(humanSqlWorkspaceScope);

function connectionPart(connectionId?: string | null) {
    return connectionId ?? 'default';
}

export function normalizeSqlWorkspaceScope(scope?: SqlWorkspaceScope | null): SqlWorkspaceScope {
    if (!scope || scope.workspaceMode === 'human') {
        return {
            workspaceMode: 'human',
            connectionId: scope?.connectionId ?? null,
            workId: null,
        };
    }

    if (scope.workspaceMode === 'artifact') {
        return {
            workspaceMode: 'artifact',
            connectionId: scope.connectionId ?? null,
            workId: null,
            artifactId: scope.artifactId ?? null,
        };
    }

    return {
        workspaceMode: 'agent',
        connectionId: scope.connectionId ?? null,
        workId: scope.workId ?? null,
        artifactId: null,
    };
}

export function getActiveTabStorageKey(scope?: SqlWorkspaceScope | null) {
    const normalized = normalizeSqlWorkspaceScope(scope);
    if (normalized.workspaceMode === 'human') {
        return `sqlconsole:activeTabId:${connectionPart(normalized.connectionId)}`;
    }
    if (normalized.workspaceMode === 'artifact') {
        return `sqlconsole:activeTabId:${connectionPart(normalized.connectionId)}:artifact:${normalized.artifactId ?? 'unknown'}`;
    }
    return `sqlconsole:activeTabId:${connectionPart(normalized.connectionId)}:work:${normalized.workId ?? 'unknown'}`;
}

export function getTabsStorageKey(scope?: SqlWorkspaceScope | null) {
    const normalized = normalizeSqlWorkspaceScope(scope);
    if (normalized.workspaceMode === 'human') {
        return `sqlconsole:tabs:${connectionPart(normalized.connectionId)}`;
    }
    if (normalized.workspaceMode === 'artifact') {
        return `sqlconsole:tabs:${connectionPart(normalized.connectionId)}:artifact:${normalized.artifactId ?? 'unknown'}`;
    }
    return `sqlconsole:tabs:${connectionPart(normalized.connectionId)}:work:${normalized.workId ?? 'unknown'}`;
}

export function getSessionStorageKey(tabId: string, scope?: SqlWorkspaceScope | null) {
    const normalized = normalizeSqlWorkspaceScope(scope);
    if (normalized.workspaceMode === 'human') {
        return `sqlconsole:sessionId:${tabId}`;
    }
    if (normalized.workspaceMode === 'artifact') {
        return `sqlconsole:sessionId:${connectionPart(normalized.connectionId)}:artifact:${normalized.artifactId ?? 'unknown'}:${tabId}`;
    }
    return `sqlconsole:sessionId:${connectionPart(normalized.connectionId)}:work:${normalized.workId ?? 'unknown'}:${tabId}`;
}
