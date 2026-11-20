type DirectoryHandle = FileSystemDirectoryHandle & {
    queryPermission(options: { mode: 'read' }): Promise<PermissionState>;
};
export type FolderSelection = { name: string; directories?: string[]; files: { path: string; contentText: string }[]; handle?: DirectoryHandle };
const picker = () => (window as Window & { showDirectoryPicker?: (options: { mode: 'read' }) => Promise<DirectoryHandle> }).showDirectoryPicker;
export const hasDirectoryPicker = () => Boolean(picker());

async function storeHandle<T>(access: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('dory-knowledge-directories', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('handles');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    try {
        return await new Promise<T>((resolve, reject) => {
            const tx = db.transaction('handles', access);
            const request = operation(tx.objectStore('handles'));
            tx.oncomplete = () => resolve(request.result);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

export function saveDirectoryHandle(id: string, handle?: DirectoryHandle) {
    return handle ? storeHandle('readwrite', store => store.put(handle, id)) : storeHandle('readwrite', store => store.delete(id));
}

export async function rememberedDirectory(id: string) {
    const handle = await storeHandle<DirectoryHandle | undefined>('readonly', store => store.get(id)).catch(() => undefined);
    return handle && (await handle.queryPermission({ mode: 'read' })) === 'granted' ? handle : undefined;
}

async function readFiles(name: string, entries: AsyncIterable<{ path: string; file: File }>): Promise<FolderSelection> {
    const files: FolderSelection['files'] = [];
    let bytes = 0;
    for await (const { path, file } of entries) {
        if (!/\.(md|markdown)$/i.test(path)) continue;
        bytes += file.size;
        if (bytes > 50_000_000 || file.size > 10_000_000 || files.length >= 5000) throw new Error('Folder exceeds the sync limit (5,000 files, 10 MB per file, 50 MB total).');
        files.push({ path, contentText: await file.text() });
    }
    return { name, files };
}

async function* walk(handle: FileSystemDirectoryHandle, directories: string[], prefix = ''): AsyncGenerator<{ path: string; file: File }> {
    for await (const child of handle.values()) {
        const path = prefix + child.name;
        if (child.kind === 'directory') {
            if (directories.length >= 10000) throw new Error('Folder exceeds the 10,000 directory limit.');
            directories.push(path);
            yield* walk(child, directories, path + '/');
        } else if (/\.(md|markdown)$/i.test(path)) yield { path, file: await child.getFile() };
    }
}

export async function readDirectory(handle?: DirectoryHandle) {
    const directory = handle ?? (await picker()!.call(window, { mode: 'read' }));
    const directories: string[] = [];
    return { ...(await readFiles(directory.name, walk(directory, directories))), directories, handle: directory };
}

export async function readDirectoryInput(list: File[]) {
    const name = list[0]?.webkitRelativePath.split('/')[0];
    if (!name) throw new Error('Select a readable directory.');
    async function* entries() {
        for (const file of list) {
            if (!file.webkitRelativePath.startsWith(name + '/')) throw new Error('Select a single directory.');
            yield { file, path: file.webkitRelativePath.slice(name!.length + 1) };
        }
    }
    const directories = new Set<string>();
    for (const file of list) {
        const parts = file.webkitRelativePath.split('/').slice(1, -1);
        for (let i = 1; i <= parts.length; i++) directories.add(parts.slice(0, i).join('/'));
    }
    return { ...(await readFiles(name, entries())), directories: [...directories] };
}
