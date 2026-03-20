import { atom } from 'jotai';
import { atomWithStorage, selectAtom } from 'jotai/utils';


export const OVERVIEW_SET = -1;

export interface ActiveSetState {
    tabId: string;
    sessionId: string;
    activeSet: number; 
    userPicked: boolean; 
}

export type ActiveSetDict = Record<string, ActiveSetState>;


export const activeSetsAtom = atomWithStorage<ActiveSetDict>('activeSets', {});


export function makeKey(tabId: string | null | undefined, sessionId: string | null | undefined) {
    const t = tabId ?? '';
    const s = sessionId ?? '';
    return `${t}:${s}`;
}


export const makeActiveSetAtom = (tabId?: string | null, sessionId?: string | null) =>
    selectAtom(activeSetsAtom, dict => {
        const key = makeKey(tabId, sessionId);
        return dict[key]?.activeSet ?? OVERVIEW_SET;
    });

export const makeActiveSetStateAtom = (tabId?: string | null, sessionId?: string | null) =>
    selectAtom(activeSetsAtom, dict => {
        const key = makeKey(tabId, sessionId);
        return (
            dict[key] ?? {
                tabId: tabId ?? '',
                sessionId: sessionId ?? '',
                activeSet: OVERVIEW_SET,
                userPicked: false,
            }
        );
    });



export const upsertActiveSetAtom = atom(null, (get, set, payload: Partial<ActiveSetState> & { tabId: string; sessionId: string }) => {
    const dict = get(activeSetsAtom);
    const key = makeKey(payload.tabId, payload.sessionId);
    const prev = dict[key];
    const next: ActiveSetState = {
        tabId: payload.tabId,
        sessionId: payload.sessionId,
        activeSet: payload.activeSet ?? prev?.activeSet ?? OVERVIEW_SET,
        userPicked: payload.userPicked ?? prev?.userPicked ?? false,
    };
    if (!prev || prev.activeSet !== next.activeSet || prev.userPicked !== next.userPicked || prev.tabId !== next.tabId || prev.sessionId !== next.sessionId) {
        set(activeSetsAtom, { ...dict, [key]: next });
    }
});


export const makeSetActiveSetAtom = (tabId?: string | null, sessionId?: string | null, markUserPicked = true) =>
    atom(null, (get, set, activeSet: number) => {
        const t = tabId ?? '';
        const s = sessionId ?? '';
        set(upsertActiveSetAtom, {
            tabId: t,
            sessionId: s,
            activeSet,
            userPicked: markUserPicked ? true : undefined,
        });
    });

export const makeSetUserPickedAtom = (tabId?: string | null, sessionId?: string | null) =>
    atom(null, (get, set, userPicked: boolean) => {
        set(upsertActiveSetAtom, {
            tabId: tabId ?? '',
            sessionId: sessionId ?? '',
            userPicked,
        });
    });


export const makeDeleteActiveSetAtom = (tabId?: string | null, sessionId?: string | null) =>
    atom(null, (get, set) => {
        const dict = get(activeSetsAtom);
        const key = makeKey(tabId, sessionId);
        if (dict[key]) {
            const { [key]: _, ...rest } = dict;
            set(activeSetsAtom, rest);
        }
    });

export const makeClearTabActiveSetsAtom = (tabId?: string | null) =>
    atom(null, (get, set) => {
        const dict = get(activeSetsAtom);
        const t = (tabId ?? '') + ':';
        let changed = false;
        const next: ActiveSetDict = {};
        for (const [k, v] of Object.entries(dict)) {
            if (!k.startsWith(t)) {
                next[k] = v;
            } else {
                changed = true;
            }
        }
        if (changed) set(activeSetsAtom, next);
    });


export const makeAutoSetActiveSetAtom = (tabId?: string | null, sessionId?: string | null) =>
    atom(null, (get, set, activeSet: number | string) => {
        const dict = get(activeSetsAtom);
        const key = makeKey(tabId, sessionId);
        const prev = dict[key];
        const next = {
            tabId: tabId ?? '',
            sessionId: sessionId ?? '',
            activeSet,
            
            userPicked: prev?.userPicked ?? false,
        };
        if (!prev || prev.activeSet !== next.activeSet || prev.userPicked !== next.userPicked) {
            set(activeSetsAtom, { ...dict, [key]: next } as ActiveSetDict);
        }
    });

export const makeUserPickedAtom = (tabId?: string | null, sessionId?: string | null) =>
    selectAtom(
        activeSetsAtom,
        dict => dict[makeKey(tabId, sessionId)]?.userPicked ?? false,
        (a, b) => a === b, 
    );
