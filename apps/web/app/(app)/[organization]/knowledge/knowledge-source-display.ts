type KnowledgeSourceName = {
    fileName: string;
    connectorProvider?: string | null;
    connectorId?: string | null;
    remotePath?: string | null;
};

export function knowledgeSourceDisplayName(source: KnowledgeSourceName): string {
    if (source.connectorProvider !== 'linear' || !source.connectorId || !source.remotePath) return source.fileName;
    const suffix = ` · ${source.connectorId.slice(-8)} · ${source.remotePath.split('/').pop()}`;
    return source.fileName.endsWith(suffix) ? source.fileName.slice(0, -suffix.length) : source.fileName;
}
