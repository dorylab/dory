import { buildDocumentDirectory, QUERY_FOLDER, ROOT, type DirectoryDocument as DocumentEntry, type DocumentFolder } from '@dory/shared/utils/knowledge-directory';
import type { KnowledgeSourceSummary } from './knowledge-sources-panel';

export { buildDocumentDirectory, ROOT };
export { storedFolderId, providers } from '@dory/shared/utils/knowledge-directory';
export type { DirectoryData, DocumentFolder, Provider } from '@dory/shared/utils/knowledge-directory';
export type DirectoryDocument = DocumentEntry<KnowledgeSourceSummary>;

export function getRootFolders(directory: Pick<ReturnType<typeof buildDocumentDirectory>, 'children' | 'sourceRoots'>, queryFolderName: string): DocumentFolder[] {
    return [{ id: QUERY_FOLDER, name: queryFolderName, parentId: ROOT, managed: true }, ...directory.sourceRoots, ...(directory.children.get(ROOT) ?? [])];
}
