'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReportWorkingDraft, ReportWorkingState } from '@dory/shared/types/report-workspace';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { executeActionClient } from '@/lib/actions/client';

export function useReportWorkingDraft(initial: ReportWorkingDraft, organizationId: string, suspendAutosave = false) {
    const t = useTranslations('WorkDocuments.Analysis');
    const [state, setState] = useState(initial.state);
    const [draft, setDraft] = useState(initial);
    const [error, setError] = useState<string | null>(null);
    const stateRef = useRef(state);
    const draftRef = useRef(draft);
    const saved = useRef(JSON.stringify(initial.state));
    const recovered = useRef(false);
    const queue = useRef<Promise<unknown>>(Promise.resolve());
    const key = `report-working-draft:${organizationId}:${initial.userId}:${initial.id ?? `${initial.documentId}:${initial.baseRevision}`}`;
    const legacyKey = `report-working-draft:${organizationId}:${initial.userId}:${initial.documentId}:${initial.baseRevision}`;
    const change = useCallback((update: ReportWorkingState | ((previous: ReportWorkingState) => ReportWorkingState)) => {
        const next = typeof update === 'function' ? update(stateRef.current) : update;
        stateRef.current = next;
        setState(next);
    }, []);
    const accept = useCallback(
        (next: ReportWorkingDraft) => {
            const current = stateRef.current;
            const merged = { ...next, results: { ...draftRef.current.results, ...next.results } };
            draftRef.current = merged;
            setDraft(merged);
            saved.current = JSON.stringify(next.state);
            // Report mutations must not replace edits made in the SQL workspace while the request was in flight.
            change({ ...next.state, tabs: current.tabs, charts: current.charts, activeTabId: current.activeTabId });
            setError(null);
            try {
                localStorage.removeItem(key);
                localStorage.removeItem(legacyKey);
            } catch {
                /* Server remains authoritative. */
            }
        },
        [change, key, legacyKey],
    );
    useEffect(() => {
        if (recovered.current) return;
        recovered.current = true;
        try {
            const value = JSON.parse(localStorage.getItem(key) ?? localStorage.getItem(legacyKey) ?? 'null');
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
    }, [change, initial, key, legacyKey, t]);
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
                        evidenceGroups: snapshot.content.evidenceGroups?.map(({ id, references }) => ({ id, references })),
                        reviewedEvidenceGroupIds: snapshot.content.reviewedEvidenceGroupIds,
                        tabs: snapshot.tabs,
                        charts: snapshot.charts,
                        activeTabId: snapshot.activeTabId,
                        applyTarget: snapshot.applyTarget,
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
                            localStorage.removeItem(legacyKey);
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
    }, [change, key, legacyKey, mutateAsync, t]);
    const rememberResults = useCallback((results: ReportWorkingDraft['results']) => {
        draftRef.current = { ...draftRef.current, results: { ...draftRef.current.results, ...results } };
        setDraft(draftRef.current);
    }, []);
    const dirty = JSON.stringify(state) !== saved.current;
    useEffect(() => {
        if (!dirty) return;
        try {
            localStorage.setItem(key, JSON.stringify({ revision: draftRef.current.revision, state }));
        } catch {
            /* Leave protection remains active. */
        }
        if (suspendAutosave) return;
        const timer = setTimeout(() => {
            void flush().catch(() => undefined);
        }, 800);
        return () => clearTimeout(timer);
    }, [dirty, state, key, flush, suspendAutosave]);
    useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => {
            if (JSON.stringify(stateRef.current) !== saved.current) event.preventDefault();
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, []);
    return { state, draft, change, accept, rememberResults, flush, dirty, saving: mutation.isPending, error };
}
