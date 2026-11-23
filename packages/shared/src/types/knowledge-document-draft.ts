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
