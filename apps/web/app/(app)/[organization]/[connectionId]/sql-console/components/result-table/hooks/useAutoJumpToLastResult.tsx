"use client";
import { useEffect, useMemo, useRef } from 'react';

type SessionStatus = 'running' | 'success' | 'error' | 'canceled' | null | undefined;

export function useAutoJumpToLastResult(opts: {
    tabId?: string | null;
    sessionId?: string | null;
    indices: number[] | null | undefined;
    sessionStatus: SessionStatus;
    finishedAt?: number | string | Date | null;
    userPicked?: boolean;
    autoSetActiveSet: (v: number) => void; 
    getCurrentActiveSet?: () => number | string | undefined;
}) {
    const { tabId, sessionId, indices, sessionStatus, finishedAt, userPicked = false, autoSetActiveSet, getCurrentActiveSet } = opts;

    const tabKey = useMemo(() => `${tabId ?? ''}:${sessionId ?? ''}`, [tabId, sessionId]);

    const prevStatusMapRef = useRef<Record<string, SessionStatus>>({});
    const prevMaxMapRef = useRef<Record<string, number>>({});
    const prevLenMapRef = useRef<Record<string, number>>({});
    const prevFinishMapRef = useRef<Record<string, number | string | null | undefined>>({});
    const jumpedOnFinishRef = useRef<Record<string, number | string | null | undefined>>({}); 

    useEffect(() => {
        const arr = indices ?? [];
        const nextMax = arr.length ? Math.max(...arr) : -1;
        const nextLen = arr.length;

        const prevStatus = prevStatusMapRef.current[tabKey];
        const prevMax = prevMaxMapRef.current[tabKey] ?? -1;
        const prevLen = prevLenMapRef.current[tabKey] ?? 0;
        const prevFinished = prevFinishMapRef.current[tabKey];

        
        const normFinished = finishedAt instanceof Date ? finishedAt.getTime() : (finishedAt as number | string | null | undefined);

        const finishedEdge = normFinished != null && normFinished !== prevFinished;
        const statusEdge = prevStatus === 'running' && sessionStatus && sessionStatus !== 'running';
        const justFinished = !!(finishedEdge || statusEdge);

        
        const resultsIncreased = nextLen > prevLen || nextMax > prevMax;

        
        const currentRaw = getCurrentActiveSet?.();
        const current = currentRaw == null ? -1 : typeof currentRaw === 'string' ? Number.parseInt(currentRaw, 10) : (currentRaw as number);

        
        const target = nextLen > 0 ? nextMax : 0;

        
        const alreadyJumpedThisFinish = finishedEdge && jumpedOnFinishRef.current[tabKey] === normFinished;

        
        
        
        const shouldJump = justFinished && !userPicked && !alreadyJumpedThisFinish && (resultsIncreased || current !== target) && target >= 0;

        if (shouldJump) {
            if (current !== target) {
                autoSetActiveSet(target);
            }
            if (finishedEdge) {
                jumpedOnFinishRef.current[tabKey] = normFinished!;
            }
        }

        
        prevStatusMapRef.current[tabKey] = sessionStatus;
        prevMaxMapRef.current[tabKey] = nextMax;
        prevLenMapRef.current[tabKey] = nextLen;
        prevFinishMapRef.current[tabKey] = normFinished ?? prevFinished;
    }, [tabKey, indices, sessionStatus, finishedAt, userPicked, autoSetActiveSet, getCurrentActiveSet]);
}
