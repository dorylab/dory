type KnowledgeSourceName = {
    fileName: string;
    connectorProvider?: string | null;
    connectorId?: string | null;
    remotePath?: string | null;
    sourceUrl?: string | null;
};

/** The suffix identifies a synced source internally; it is not part of its title. */
export function knowledgeSourceDisplayName(source: KnowledgeSourceName): string {
    const { fileName, connectorProvider, connectorId, remotePath, sourceUrl } = source;
    if (connectorProvider === 'linear' && connectorId && remotePath) {
        const suffix = ` · ${connectorId.slice(-8)} · ${remotePath.split('/').pop()}`;
        if (fileName.endsWith(suffix)) return fileName.slice(0, -suffix.length);
    }
    if (connectorProvider === 'github' && connectorId) {
        const suffix = ` · ${connectorId.slice(-8)}`;
        if (fileName.endsWith(suffix)) return fileName.slice(0, -suffix.length);
    }
    // Historical evidence has the title and original URL, but no connector row.
    if (connectorProvider === 'linear' || sourceUrl?.startsWith('https://linear.app/'))
        return fileName.replace(/ · [a-f0-9]{8} · [a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.md$/i, '');
    if (connectorProvider === 'github' || sourceUrl?.startsWith('https://github.com/')) return fileName.replace(/ · [a-f0-9]{8}$/i, '');
    return fileName;
}
