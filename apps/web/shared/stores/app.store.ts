import { atom, Getter } from 'jotai';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';
import { DEFAULT_ACTIVE_TAB } from '../data/app.data';
import { ConnectionListItem } from '@/types/connections';
import { UITabPayload } from '@/types/tabs';

// DB State
const sessionStorageJSON = createJSONStorage(() => sessionStorage);
export const clientDBReadyAtom = atomWithStorage('clientDBReady', 'false', sessionStorageJSON);

// App State
export const currentConnectionAtom = atomWithStorage<ConnectionListItem | null>('currentConnection', null);

// export const databasesStorageAtom = atomWithStorage<any[]>('databases', []);
export const databasesAtom = atom<{ label: string; value: string }[]>([]);
export const tablesAtom = atom<{ label: string; value?: string }[]>([]);
export const columnsAtom = atom<TableColumn[]>([]);
export type ColumnsCacheEntry = { columns: TableColumn[]; updatedAt: number };
const columnsCacheStorage = createJSONStorage<Record<string, ColumnsCacheEntry>>(() => sessionStorage);
export const columnsCacheAtom = atomWithStorage<Record<string, ColumnsCacheEntry>>(
    'columnsCache',
    {},
    columnsCacheStorage,
);
export const activeDatabaseAtom = atomWithStorage('activeDatabase', '');

const DEFAULT_CONNECTION_KEY = '__default__';

const tabsByConnectionAtom = atomWithStorage<Record<string, UITabPayload[]>>('tabsByConnection', {});
const activeTabIdByConnectionAtom = atomWithStorage<Record<string, string>>('activeTabIdByConnection', {});

const resolveConnectionKey = (get: Getter) => get(currentConnectionAtom)?.connection.id ?? DEFAULT_CONNECTION_KEY;

export const tabsAtom = atom(
    (get): UITabPayload[] => {
        const key = resolveConnectionKey(get);
        const allTabs = get(tabsByConnectionAtom);
        if (allTabs[key]) return allTabs[key];
        return key === DEFAULT_CONNECTION_KEY ? [DEFAULT_ACTIVE_TAB] : [];
    },
    (get, set, updater: UITabPayload[] | ((prev: UITabPayload[]) => UITabPayload[])) => {
        const key = resolveConnectionKey(get);
        const prev = get(tabsByConnectionAtom);
        const prevTabs = prev[key] ?? [];
        const nextTabs = typeof updater === 'function' ? (updater as (prev: UITabPayload[]) => UITabPayload[])(prevTabs) : updater;
        set(tabsByConnectionAtom, { ...prev, [key]: nextTabs });
    },
);

export const activeTabIdAtom = atom(
    (get): string => {
        const key = resolveConnectionKey(get);
        const map = get(activeTabIdByConnectionAtom);
        return map[key] ?? '';
    },
    (get, set, value: string) => {
        const key = resolveConnectionKey(get);
        const prev = get(activeTabIdByConnectionAtom);
        set(activeTabIdByConnectionAtom, { ...prev, [key]: value });
    },
);

export const tabsMapAtom = atom<Map<string, UITabPayload>>(get => {
    const tabs = get(tabsAtom);
    // 把数组转换成 Map，查找 O(1)
    return new Map(tabs.map(tab => [tab.tabId, tab]));
});

export const activeTabAtom = atom<UITabPayload>(get => {
    const tabsMap = get(tabsMapAtom);
    const activeId = get(activeTabIdAtom);

    const tab = activeId ? tabsMap.get(activeId) : undefined;
    if (tab) return tab;
    const first = tabsMap.values().next().value as UITabPayload | undefined;
    return first ?? DEFAULT_ACTIVE_TAB;
});
