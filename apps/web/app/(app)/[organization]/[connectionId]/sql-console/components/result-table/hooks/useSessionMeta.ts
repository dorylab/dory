import { useEffect } from "react";
import { SessionStatus } from "../types";
import { makeCacheKey, touchCache, RESULTS_CACHE } from "./useResultsCache";

export function useSessionMeta(params: {
    dbReady: boolean;
    tabId?: string | null;
    sessionId?: string | null;
    activeSet: number;
    dataVersion?: number;
    getSession: (sid: string) => Promise<any>;
    setMeta: (updater: any) => void;
    sessionStatus: SessionStatus;
}) {
    const { dbReady, tabId, sessionId, activeSet, dataVersion, getSession, setMeta, sessionStatus } = params;

    useEffect(() => {
        let canceled = false;
        (async () => {
            if (!dbReady || !sessionId) {
                if (!canceled) setMeta({});
                return;
            }
            try {
                const sess: any = await getSession(sessionId);
                if (canceled) return;
                const startedRaw = sess?.startedAt ?? sess?.started_at;
                const finishedRaw = sess?.finishedAt ?? sess?.finished_at;
                const startedAt = startedRaw ? new Date(startedRaw) : undefined;
                const finishedAt = finishedRaw ? new Date(finishedRaw) : undefined;
                const durationMs = sess?.durationMs ?? sess?.elapsed_ms ?? (startedAt && finishedAt ? finishedAt.getTime() - startedAt.getTime() : undefined);

                setMeta((prev: any) => {
                    const next = {
                        ...prev,
                        startedAt,
                        finishedAt,
                        durationMs,
                        fromCache: sess?.fromCache ?? sess?.cache ?? sess?.cache_hit,
                        source: sess?.source ?? sess?.engine ?? sess?.backend,
                        scannedRows: sess?.scannedRows ?? sess?.scanned_rows,
                        scannedBytes: sess?.scannedBytes ?? sess?.scanned_bytes,
                        syncing: sess?.syncing ?? sess?.verifying ?? false,
                    };
                    const key = makeCacheKey(tabId ?? undefined, sessionId ?? undefined, activeSet);
                    if (key) touchCache(key, { meta: { ...RESULTS_CACHE.get(key)?.meta, ...next }, sessionStatus, dataVersion });
                    return next;
                });
            } catch {}
        })();
        return () => {
            canceled = true;
        };
    }, [dbReady, sessionId, dataVersion, getSession, tabId, activeSet, sessionStatus, setMeta]);
}
