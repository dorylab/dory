export type SchemaEvidence = {
    database: string;
    tables: { name: string; digest: string }[];
    references: { kind: 'document' | 'query'; id: string }[];
};

export type GeneratedDocument = { fileName: string; contentText: string; evidence: SchemaEvidence };
export type DocumentTopic = { name: string; documents: GeneratedDocument[] };
export type SignedDraftFile = GeneratedDocument & { proof: string };
export type DocumentDraft = { topics: { name: string; documents: SignedDraftFile[] }[]; failedTables: string[] };
export type CreatedDocument = { folderId: string; id: string };

export type DocumentGenerationInput = {
    knowledgeModelId: string;
    connectionId: string;
    database: string;
    tables: string[];
    prompt: string;
    documentIds: string[];
    queryIds: string[];
    locale: 'zh' | 'en' | 'ja' | 'es';
};
export type DocumentGenerationStatus = 'queued' | 'running' | 'ready' | 'failed' | 'saved';
export type DocumentGenerationPhase = 'queued' | 'reading' | 'organizing' | 'validating' | 'ready' | 'failed' | 'saved';
export type DocumentGenerationTask = {
    id: string;
    knowledgeModelId: string;
    modelName: string;
    database: string;
    folderId: string | null;
    folderName: string | null;
    status: DocumentGenerationStatus;
    phase: DocumentGenerationPhase;
    completedTables: number;
    totalTables: number;
    error: string | null;
    createdAt: string;
    updatedAt: string;
    documents: CreatedDocument[];
};
export type DocumentGenerationTaskDetail = DocumentGenerationTask & {
    input: DocumentGenerationInput;
    draft: DocumentDraft | null;
};
