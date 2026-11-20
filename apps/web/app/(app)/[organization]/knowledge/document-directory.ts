import type { KnowledgeSourceSummary } from './knowledge-sources-panel';

export type DirectoryData = {
    canWrite: boolean;
    folders: { id: string; name: string; parentId: string | null }[];
    connectors: {
        id: string;
        provider: Provider;
        displayName?: string | null;
        syncedFolders?: { id: string; parent: string; name: string }[] | null;
        repositoryFullName: string | null;
        linearWorkspaceName: string | null;
        rootPath: string;
    }[];
};

export type DocumentFolder = { id: string; parentId: string | null; name: string; managed: boolean; provider?: Provider };
export type DirectoryDocument = { id: string; name: string; parentId: string; source: KnowledgeSourceSummary | null };
export const ROOT = 'dory';
export const providers = ['local', 'github', 'linear', 'drive'] as const;
export type Provider = (typeof providers)[number];

export function storedFolderId(id: string) {
    return id === ROOT ? null : id;
}

export function buildDocumentDirectory(guide: string | null, data: DirectoryData, sources: KnowledgeSourceSummary[]) {
    const root: DocumentFolder = { id: ROOT, parentId: null, name: 'Dory', managed: false, provider: 'local' };
    const folders = new Map([[ROOT, root]]);
    const connectors = new Map(data.connectors.map(item => [item.id, item]));
    for (const folder of data.folders) folders.set(folder.id, { ...folder, parentId: folder.parentId ?? ROOT, managed: false });
    const sourceRoots: (DocumentFolder & { provider: Provider })[] = [];
    for (const connector of data.connectors) {
        const name =
            connector.provider === 'github'
                ? [connector.repositoryFullName ?? 'GitHub', connector.rootPath].filter(Boolean).join(' / ')
                : (connector.displayName ?? connector.linearWorkspaceName ?? 'Linear');
        const connectionRoot = { id: connector.id, parentId: null, name, managed: true, provider: connector.provider };
        folders.set(connector.id, connectionRoot);
        sourceRoots.push(connectionRoot);
        for (const child of connector.syncedFolders ?? []) {
            const id = connector.id + '/' + child.id;
            folders.set(id, { id, parentId: child.parent ? connector.id + '/' + child.parent : connector.id, name: child.name, managed: true });
        }
    }
    const documents: DirectoryDocument[] = [];
    for (const source of sources) {
        if (source.format !== 'markdown') continue;
        let parentId = source.folderId ?? ROOT;
        let name = source.fileName;
        if (source.connectorId) {
            const connector = connectors.get(source.connectorId);
            if (!connector) continue;
            parentId = connector.id;
            if ((connector.provider === 'github' || connector.provider === 'local') && source.remotePath) {
                const prefix = connector.rootPath ? connector.rootPath + '/' : '';
                const segments = source.remotePath.slice(source.remotePath.startsWith(prefix) ? prefix.length : 0).split('/');
                name = segments.pop() || name;
                for (const segment of segments) {
                    const id = parentId + '/' + segment;
                    folders.set(id, { id, parentId, name: segment, managed: true });
                    parentId = id;
                }
            } else if (connector.provider === 'drive') {
                for (const segment of source.folderTrail ?? []) {
                    const id = connector.id + '/' + segment.id;
                    folders.set(id, { id, parentId, name: segment.name, managed: true });
                    parentId = id;
                }
            } else if (source.projectId && source.projectName) {
                const id = parentId + '/' + source.projectId;
                folders.set(id, { id, parentId, name: source.projectName, managed: true });
                parentId = id;
            }
        }
        documents.push({ id: source.id, parentId, name, source });
    }
    documents.sort((a, b) => a.name.localeCompare(b.name));
    if (guide) documents.unshift({ id: 'guide', parentId: ROOT, name: guide, source: null });
    const documentsByFolder = new Map<string, DirectoryDocument[]>();
    for (const doc of documents) {
        const siblings = documentsByFolder.get(doc.parentId);
        if (siblings) siblings.push(doc);
        else documentsByFolder.set(doc.parentId, [doc]);
    }
    const children = new Map<string, DocumentFolder[]>();
    for (const folder of folders.values()) {
        if (folder.parentId === null) continue;
        const siblings = children.get(folder.parentId) ?? [];
        siblings.push(folder);
        children.set(folder.parentId, siblings);
    }
    for (const siblings of children.values()) siblings.sort((a, b) => a.name.localeCompare(b.name));

    function trail(id: string) {
        const path: DocumentFolder[] = [];
        for (let folder = folders.get(id); folder; folder = folder.parentId === null ? undefined : folders.get(folder.parentId)) path.push(folder);
        return path.reverse();
    }
    const counts = new Map<string, number>();
    for (const doc of documents) counts.set(doc.parentId, (counts.get(doc.parentId) ?? 0) + 1);
    // Post-order accumulation visits each folder once, including empty folders.
    sourceRoots.sort((a, b) => providers.indexOf(a.provider) - providers.indexOf(b.provider) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const roots = [root, ...sourceRoots];
    const ordered = [...roots];
    for (const folder of ordered) for (const child of children.get(folder.id) ?? []) ordered.push(child);
    for (const folder of ordered.reverse()) {
        if (folder.parentId !== null) counts.set(folder.parentId, (counts.get(folder.parentId) ?? 0) + (counts.get(folder.id) ?? 0));
    }
    return { root, roots, folders, documents, documentsByFolder, children, counts, trail };
}
