import { TabResult } from '@/lib/client/type';
import type { ActionIntent } from '@/lib/copilot/action/types';
import type { AnalysisWorkspaceState, AnalysisResultRef } from '@dory/analysis/types';
import type { ResultAction } from '@dory/analysis/core/result-actions';
import { activeTabIdAtom } from '@/shared/stores/app.store';
import { atom } from 'jotai';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';

const defaultSize = {
    left: 22,
    right: 40,
    bottom: 30,
};

export const panelSizeAtom = atomWithStorage('panelSize', defaultSize);

const booleanStorage = createJSONStorage<boolean>(() => localStorage);
const numberStorage = createJSONStorage<number>(() => localStorage);
export const copilotPanelOpenAtom = atomWithStorage<boolean>('sqlConsole.copilotPanelOpen', true, booleanStorage);
export const copilotPanelWidthAtom = atomWithStorage<number>('sqlConsole.copilotPanelWidth', 30, numberStorage);
export const copilotPanelTabAtom = atomWithStorage<'ask' | 'action' | 'context'>(
    'sqlConsole.copilotPanelTab',
    'ask',
    createJSONStorage(() => localStorage),
);

export type SavedQueriesView = 'my-queries' | 'query-history';

export const savedQueriesViewByConnectionAtom = atomWithStorage<Record<string, SavedQueriesView>>(
    'sqlConsole.savedQueriesViewByConnection',
    {},
    createJSONStorage(() => localStorage),
);

export const currentTabResultAtom = atom<TabResult[]>([]);

export const sessionIdByTabAtom = atom<Record<string, string>>({});

export type EditorSelectionRange = { start: number; end: number };

export const editorSelectionByTabAtom = atom<Record<string, EditorSelectionRange | null>>({});

export type CopilotActionRequest = {
    id: string;
    intent: ActionIntent;
};

export const copilotActionRequestAtom = atom<CopilotActionRequest | null>(null);

export type InlineSqlAskMode = 'sql' | 'ask-ai';

export type InlineSqlAskState = {
    mode: InlineSqlAskMode;
    promptDraft: string;
    isGenerating: boolean;
    lastPrompt: string | null;
    lastGeneratedSql: string | null;
    errorMessage: string | null;
};

export const DEFAULT_INLINE_SQL_ASK_STATE: InlineSqlAskState = {
    mode: 'sql',
    promptDraft: '',
    isGenerating: false,
    lastPrompt: null,
    lastGeneratedSql: null,
    errorMessage: null,
};

export const inlineSqlAskByTabAtom = atom<Record<string, InlineSqlAskState>>({});

export const activeSessionIdAtom = atom<string | undefined>(get => {
    const tabId = get(activeTabIdAtom);
    const map = get(sessionIdByTabAtom);
    return tabId ? map[tabId] : undefined;
});

export const runningTabsAtom = atom<Record<string, 'idle' | 'running' | 'success' | 'error' | 'canceled'>>({});
export const localDataLoadingAtom = atom<Record<string, boolean>>({});

export type CopilotAnalysisRequest = {
    id: string;
    suggestionId: string;
    action?: ResultAction;
    sqlPreview?: string;
    sourceResultRef?: AnalysisResultRef;
};

export const copilotAnalysisRequestAtom = atom<CopilotAnalysisRequest | null>(null);

export const analysisWorkspaceStateAtom = atomWithStorage<Record<string, AnalysisWorkspaceState>>(
    'sqlConsole.analysisWorkspaceState',
    {},
    createJSONStorage(() => localStorage),
);

function makeAnalysisWorkspaceKey(tabId?: string | null, sessionId?: string | null, setIndex?: number | null) {
    if (!tabId || !sessionId || typeof setIndex !== 'number' || setIndex < 0) return null;
    return `${tabId}:${sessionId}#${setIndex}`;
}

export const upsertAnalysisWorkspaceAtom = atom(
    null,
    (
        get,
        set,
        payload: {
            tabId: string;
            sessionId: string;
            setIndex: number;
            patch: Partial<AnalysisWorkspaceState> | ((prev: AnalysisWorkspaceState | null) => AnalysisWorkspaceState);
        },
    ) => {
        const key = makeAnalysisWorkspaceKey(payload.tabId, payload.sessionId, payload.setIndex);
        if (!key) return;
        const current = get(analysisWorkspaceStateAtom);
        const prev = current[key] ?? null;
        const next =
            typeof payload.patch === 'function'
                ? payload.patch(prev)
                : {
                      currentFocus: prev?.currentFocus,
                      suggestions: prev?.suggestions ?? [],
                      sessions: prev?.sessions ?? [],
                      lastSelectedSessionId: prev?.lastSelectedSessionId,
                      ...payload.patch,
                  };
        set(analysisWorkspaceStateAtom, {
            ...current,
            [key]: next,
        });
    },
);

export function analysisWorkspaceKeyFor(tabId?: string | null, sessionId?: string | null, setIndex?: number | null) {
    return makeAnalysisWorkspaceKey(tabId, sessionId, setIndex);
}
