import type { DirectoryDocument as DocumentEntry } from '@dory/shared/utils/knowledge-directory';
import type { KnowledgeSourceSummary } from './knowledge-sources-panel';

export { buildDocumentDirectory, ROOT, storedFolderId, providers } from '@dory/shared/utils/knowledge-directory';
export type { DirectoryData, DocumentFolder, Provider } from '@dory/shared/utils/knowledge-directory';
export type DirectoryDocument = DocumentEntry<KnowledgeSourceSummary>;
