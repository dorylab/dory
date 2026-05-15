import type { SidebarObjectTarget, SidebarSelection, TargetOption } from './types';
import type { DatabaseObjects, GroupState } from './types';
import { DEFAULT_GROUP_STATE, EMPTY_DATABASE_OBJECTS } from './types';

export type LocalFilesSidebarEntry = {
    entry: TargetOption;
    objectKind: 'table' | 'view';
};

export type LocalFilesSidebarItem = {
    key: string;
    label: string;
    target: SidebarObjectTarget;
    objectKind: LocalFilesSidebarEntry['objectKind'];
    selected: boolean;
};

export function resolveLocalFilesEntryValue(entry: TargetOption) {
    return (entry.value ?? entry.name ?? entry.label ?? '').toString();
}

export function resolveLocalFilesEntryLabel(entry: TargetOption) {
    return (entry.label ?? entry.value ?? entry.name ?? '').toString();
}

export function resolveLocalFilesDatabase(selectedDatabase: string | undefined, databaseEntries: Array<{ value: string }>) {
    return selectedDatabase ?? databaseEntries[0]?.value;
}

export function buildLocalFilesSidebarEntries(objects: DatabaseObjects): LocalFilesSidebarEntry[] {
    return [...objects.tables.map(entry => ({ entry, objectKind: 'table' as const })), ...objects.views.map(entry => ({ entry, objectKind: 'view' as const }))];
}

export function filterLocalFilesSidebarEntries(entries: LocalFilesSidebarEntry[], normalizedFilter: string) {
    if (!normalizedFilter) return entries;
    return entries.filter(
        item =>
            resolveLocalFilesEntryLabel(item.entry).toLowerCase().includes(normalizedFilter) || resolveLocalFilesEntryValue(item.entry).toLowerCase().includes(normalizedFilter),
    );
}

export function isLocalFilesLoading(loadingState: GroupState) {
    return Boolean(loadingState.tables || loadingState.views);
}

export function isLocalFilesSidebarEntrySelected(params: {
    database: string;
    entry: TargetOption;
    objectKind: LocalFilesSidebarEntry['objectKind'];
    selectedDatabase?: string;
    selectedObject?: SidebarSelection;
}) {
    const entryValue = resolveLocalFilesEntryValue(params.entry);
    const entryLabel = resolveLocalFilesEntryLabel(params.entry);
    return (
        params.selectedDatabase === params.database &&
        params.selectedObject?.objectKind === params.objectKind &&
        (entryValue === params.selectedObject.name || entryLabel === params.selectedObject.name)
    );
}

export function buildLocalFilesObjectTarget(params: { database: string; entry: TargetOption; objectKind: LocalFilesSidebarEntry['objectKind'] }): SidebarObjectTarget {
    return {
        database: params.database,
        objectKind: params.objectKind,
        name: resolveLocalFilesEntryValue(params.entry),
        label: resolveLocalFilesEntryLabel(params.entry),
    };
}

export function buildLocalFilesSidebarModel(params: {
    selectedDatabase?: string;
    selectedObject?: SidebarSelection;
    databaseEntries: Array<{ value: string }>;
    databaseObjects: Record<string, DatabaseObjects>;
    loadingGroups: Record<string, GroupState>;
    normalizedFilter: string;
}) {
    const database = resolveLocalFilesDatabase(params.selectedDatabase, params.databaseEntries);
    const objects = database ? (params.databaseObjects[database] ?? EMPTY_DATABASE_OBJECTS) : EMPTY_DATABASE_OBJECTS;
    const loadingState = database ? (params.loadingGroups[database] ?? DEFAULT_GROUP_STATE) : DEFAULT_GROUP_STATE;
    const entries = filterLocalFilesSidebarEntries(buildLocalFilesSidebarEntries(objects), params.normalizedFilter);

    return {
        database,
        loading: isLocalFilesLoading(loadingState),
        items: database
            ? entries.map(({ entry, objectKind }) => {
                  const value = resolveLocalFilesEntryValue(entry);
                  const target = buildLocalFilesObjectTarget({
                      database,
                      entry,
                      objectKind,
                  });
                  return {
                      key: `local-files-${objectKind}-${value}`,
                      label: target.label ?? value,
                      target,
                      objectKind,
                      selected: isLocalFilesSidebarEntrySelected({
                          database,
                          entry,
                          objectKind,
                          selectedDatabase: params.selectedDatabase,
                          selectedObject: params.selectedObject,
                      }),
                  };
              })
            : [],
    };
}
