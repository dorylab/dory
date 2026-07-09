import { authFetch } from '@/lib/client/auth-fetch';

export type QueryExecutePayload = {
    session: {
        sessionId: string;
        userId?: string | null;
        tabId?: string | null;
        connectionId?: string | null;
        database?: string | null;
        sqlText: string;
        status: 'running' | 'success' | 'error' | 'canceled';
        errorMessage?: string | null;
        startedAt?: string | number | Date | null;
        finishedAt?: string | number | Date | null;
        resultSetCount?: number;
        durationMs?: number | null;
        stopOnError?: boolean;
        source?: string | null;
        [key: string]: unknown;
    };
    queryResultSets: Array<any>;
    results: any[][];
    meta?: Record<string, unknown>;
};

export type SqlConsoleQueryStreamEvent =
    | { type: 'session-started'; payload: QueryExecutePayload }
    | { type: 'result-started'; payload: QueryExecutePayload }
    | { type: 'result-preview'; payload: QueryExecutePayload }
    | {
          type: 'result-progress';
          payload: {
              sessionId: string;
              setIndex: number;
              rowsWritten: number;
              previewRowCount: number;
              elapsedMs: number;
          };
      }
    | { type: 'result-completed'; payload: QueryExecutePayload }
    | { type: 'session-finished'; payload: QueryExecutePayload }
    | {
          type: 'error';
          payload: {
              sessionId?: string;
              message: string;
              code?: string;
          };
      };

export async function runSqlQueryStream(options: {
    input: Record<string, unknown>;
    organizationId?: string;
    currentConnectionId?: string | null;
    signal?: AbortSignal;
    onEvent: (event: SqlConsoleQueryStreamEvent) => Promise<void> | void;
}) {
    const response = await authFetch('/api/sql-console/query/stream', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            input: options.input,
            organizationId: options.organizationId,
            currentConnectionId: options.currentConnectionId,
        }),
        signal: options.signal,
    });

    if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { message?: string; code?: string } | null;
        throw Object.assign(new Error(payload?.message ?? 'Query stream failed'), {
            code: payload?.code,
            status: response.status,
        });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex >= 0) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (line) {
                await options.onEvent(JSON.parse(line) as SqlConsoleQueryStreamEvent);
            }
            newlineIndex = buffer.indexOf('\n');
        }
    }

    const tail = `${buffer}${decoder.decode()}`.trim();
    if (tail) {
        await options.onEvent(JSON.parse(tail) as SqlConsoleQueryStreamEvent);
    }
}
