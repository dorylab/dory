const DAY_MS = 24 * 60 * 60 * 1000;

export type ArtifactFreshness = 'fresh' | 'aging' | 'stale';
export type ArtifactListOrigin = 'agent-run' | 'sql-workspace' | 'comparison' | 'unknown';

export function getArtifactFreshness(updatedAt: string | Date, now = Date.now()): ArtifactFreshness {
    const timestamp = new Date(updatedAt).getTime();
    const age = Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : Number.POSITIVE_INFINITY;
    if (age <= 7 * DAY_MS) return 'fresh';
    if (age <= 30 * DAY_MS) return 'aging';
    return 'stale';
}

export function getArtifactListOrigin(artifact: { agentRunId: string | null; comparisonId: string | null; sourceType: string | null }): ArtifactListOrigin {
    if (artifact.agentRunId) return 'agent-run';
    if (artifact.comparisonId) return 'comparison';
    if (artifact.sourceType === 'query-run') return 'sql-workspace';
    return 'unknown';
}

export function formatArtifactRelativeTime(timestamp: string | Date, locale: string, now = Date.now()) {
    const value = new Date(timestamp).getTime();
    if (!Number.isFinite(value)) return null;

    const difference = value - now;
    const absoluteDifference = Math.abs(difference);
    const units: Array<{ unit: Intl.RelativeTimeFormatUnit; milliseconds: number }> = [
        { unit: 'year', milliseconds: 365 * DAY_MS },
        { unit: 'month', milliseconds: 30 * DAY_MS },
        { unit: 'day', milliseconds: DAY_MS },
        { unit: 'hour', milliseconds: 60 * 60 * 1000 },
        { unit: 'minute', milliseconds: 60 * 1000 },
        { unit: 'second', milliseconds: 1000 },
    ];
    const selected = units.find(candidate => absoluteDifference >= candidate.milliseconds) ?? units[units.length - 1]!;
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(Math.round(difference / selected.milliseconds), selected.unit);
}
