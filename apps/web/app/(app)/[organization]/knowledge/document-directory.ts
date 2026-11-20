import type { KnowledgeSourceSummary } from './knowledge-sources-panel';

export type DirectoryData = {
    canWrite: boolean;
    folders: { id: string; name: string; parentId: string | null }[];
    connectors: { id: string; provider: 'github' | 'linear'; repositoryFullName: string | null; linearWorkspaceName: string | null; rootPath: string }[];
};

export type DocumentFolder = { id: string; parentId: string | null; name: string; managed: boolean };
export type DirectoryDocument = { id: string; name: string; parentId: string; source: KnowledgeSourceSummary | null };
export const ROOT = '';

export function buildDocumentDirectory(modelName: string, guide: string | null, data: DirectoryData, sources: KnowledgeSourceSummary[]) {
    const root: DocumentFolder = { id: ROOT, parentId: null, name: modelName, managed: false };
    const folders = new Map([[ROOT, root]]);
    const connectors = new Map(data.connectors.map(item => [item.id, item]));
    for (const folder of data.folders) folders.set(folder.id, { ...folder, parentId: folder.parentId ?? ROOT, managed: false });
    for (const connector of data.connectors) {
        const name =
            connector.provider === 'github'
                ? [connector.repositoryFullName ?? 'GitHub', connector.rootPath].filter(Boolean).join(' / ')
                : (connector.linearWorkspaceName ?? 'Linear');
        folders.set(connector.id, { id: connector.id, parentId: ROOT, name, managed: true });
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
            if (connector.provider === 'github' && source.remotePath) {
                const prefix = connector.rootPath ? connector.rootPath + '/' : '';
                const segments = source.remotePath.slice(source.remotePath.startsWith(prefix) ? prefix.length : 0).split('/');
                name = segments.pop() || name;
                for (const segment of segments) {
                    const id = parentId + '/' + segment;
                    folders.set(id, { id, parentId, name: segment, managed: true });
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
    const ordered = [root];
    for (const folder of ordered) for (const child of children.get(folder.id) ?? []) ordered.push(child);
    for (const folder of ordered.reverse()) {
        if (folder.parentId !== null) counts.set(folder.parentId, (counts.get(folder.parentId) ?? 0) + (counts.get(folder.id) ?? 0));
    }
    return { root, folders, documents, documentsByFolder, children, counts, trail };
}
