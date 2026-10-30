'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import type { ReportWorkingDraft, ReportWorkingState } from '@dory/shared/types/report-workspace';
import { executeActionClient } from '@/lib/actions/client';

export function useReportWorkingDraft(initial: ReportWorkingDraft, organizationId: string) {
    const t = useTranslations('WorkDocuments.Analysis');
    const [state, setState] = useState(initial.state);
    const [draft, setDraft] = useState(initial);
    const [error, setError] = useState<string | null>(null);
    const stateRef = useRef(state);
    const draftRef = useRef(draft);
    const saved = useRef(JSON.stringify(initial.state));
    const recovered = useRef(false);
    const queue = useRef<Promise<unknown>>(Promise.resolve());
    const key = `report-working-draft:${organizationId}:${initial.userId}:${initial.documentId}:${initial.baseRevision}`;
    const change = useCallback((update: ReportWorkingState | ((previous: ReportWorkingState) => ReportWorkingState)) => {
        const next = typeof update === 'function' ? update(stateRef.current) : update;
        stateRef.current = next;
        setState(next);
    }, []);
    const accept = useCallback(
        (next: ReportWorkingDraft) => {
            draftRef.current = next;
            setDraft(next);
            saved.current = JSON.stringify(next.state);
            change(next.state);
            setError(null);
            try {
                localStorage.removeItem(key);
            } catch {
                /* Server remains authoritative. */
            }
        },
        [change, key],
    );
    useEffect(() => {
        if (recovered.current) return;
        recovered.current = true;
        try {
            const value = JSON.parse(localStorage.getItem(key) ?? 'null');
            if (value?.state && value.revision === initial.revision) change(value.state);
            else if (value?.state) {
                // Keep the stale revision: autosave must conflict, never overwrite newer edits.
                draftRef.current = { ...initial, revision: value.revision };
                setDraft(draftRef.current);
                change(value.state);
                setError(t('LocalConflict'));
            }
        } catch {
            /* Storage may be disabled. */
        }
    }, [change, initial, key, t]);
    const mutation = useMutation({
        retry: false,
        mutationFn: (input: unknown) => executeActionClient<ReportWorkingDraft>('report.workspace.saveDraft', input, { organizationId }),
    });
    const mutateAsync = mutation.mutateAsync;
    const flush = useCallback(() => {
        const operation = queue.current
            .catch(() => undefined)
            .then(async () => {
                const snapshot = stateRef.current;
                const fingerprint = JSON.stringify(snapshot);
                if (fingerprint === saved.current) return draftRef.current;
                const current = draftRef.current;
                try {
                    const next = await mutateAsync({
                        documentId: current.documentId,
                        baseRevision: current.baseRevision,
                        expectedDraftRevision: current.revision,
                        title: snapshot.title,
                        body: snapshot.content.body ?? '',
                        visuals: snapshot.content.visuals,
                        tabs: snapshot.tabs,
                        activeTabId: snapshot.activeTabId,
                        proseReviewed: !snapshot.proseNeedsReview,
                    });
                    draftRef.current = next;
                    setDraft(next);
                    saved.current = fingerprint;
                    setError(null);
                    if (JSON.stringify(stateRef.current) === fingerprint) {
                        saved.current = JSON.stringify(next.state);
                        change(next.state);
                        try {
                            localStorage.removeItem(key);
                        } catch {
                            /* Best effort local recovery. */
                        }
                    }
                    return next;
                } catch (err) {
                    setError(err instanceof Error ? err.message : t('SaveFailed'));
                    throw err;
                }
            });
        queue.current = operation;
        return operation;
    }, [change, key, mutateAsync, t]);
    const dirty = JSON.stringify(state) !== saved.current;
    useEffect(() => {
        if (!dirty) return;
        try {
            localStorage.setItem(key, JSON.stringify({ revision: draftRef.current.revision, state }));
        } catch {
            /* Leave protection remains active. */
        }
        const timer = setTimeout(() => {
            void flush().catch(() => undefined);
        }, 800);
        return () => clearTimeout(timer);
    }, [dirty, state, key, flush]);
    useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => {
            if (JSON.stringify(stateRef.current) !== saved.current) event.preventDefault();
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, []);
    return { state, draft, change, accept, flush, dirty, saving: mutation.isPending, error };
}
