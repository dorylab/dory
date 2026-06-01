export type NormalizedDoryTarget = {
    origin: string;
    endpoint: string;
};

function parseUrl(input: string) {
    try {
        return new URL(input);
    } catch {
        return new URL(`http://${input}`);
    }
}

export function normalizeDoryTarget(input?: string | null): NormalizedDoryTarget {
    const raw = input?.trim() || process.env.DORY_MCP_URL?.trim() || 'http://localhost:3000';
    const parsed = parseUrl(raw);
    const origin = parsed.origin;
    const endpoint = parsed.pathname.replace(/\/$/, '') === '/api/mcp' ? parsed.toString() : new URL('/api/mcp', origin).toString();

    return {
        origin,
        endpoint,
    };
}
