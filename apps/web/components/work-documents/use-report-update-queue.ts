'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReportUpdateContext, ReportUpdateItem } from '@dory/shared/types/report-updates';
import { recoverTabUpdates } from '@/lib/work-documents/report-updates';
import { executeActionClient } from '@/lib/actions/client';

export function useReportUpdateQueue(initial: ReportUpdateContext, workId: string, organizationId: string, readOnly: boolean) {
    const key = `report-updates:${organizationId}:${initial.userId}:${initial.document.id}`;
    const [items, setItems] = useState(initial.items);
    const state = useRef(initial.items),
        saved = useRef(initial.items),
        revision = useRef(initial.draftRevision);
    const tail = useRef<Promise<unknown>>(Promise.resolve());
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const lock = useRef(false);
    const request = useRef<{ revision: number; id: string } | null>(null);
    const input = { documentId: initial.document.id, workId, baseRevision: initial.baseRevision, revision: initial.document.revision };
    const change = useCallback(
        (next: ReportUpdateItem[]) => {
            if (lock.current || readOnly || JSON.stringify(state.current) === JSON.stringify(next)) return;
            state.current = next;
            setItems(next);
            try {
                localStorage.setItem(key, JSON.stringify({ revision: revision.current, reportRevision: initial.document.revision, items: next }));
            } catch {
                /* Server save remains available. */
            }
        },
        [key, initial.document.revision, readOnly],
    );
    useEffect(() => {
        if (readOnly) return;
        try {
            const local = JSON.parse(localStorage.getItem(key) ?? 'null');
            if (local?.reportRevision < initial.document.revision && Array.isArray(local.items)) {
                const recovered = new Map(initial.items.map(item => [item.tabId, item]));
                for (const item of recoverTabUpdates(local.items, initial.bindings)) recovered.set(item.tabId, { ...item, needsReview: true });
                change([...recovered.values()]);
            } else if (local?.reportRevision === initial.document.revision && Array.isArray(local.items)) {
                if (local.revision !== initial.draftRevision) {
                    const merged = new Map(initial.items.map(item => [item.tabId, item]));
                    for (const item of recoverTabUpdates(local.items, initial.bindings)) {
                        if (!merged.has(item.tabId) || JSON.stringify(item) !== JSON.stringify(merged.get(item.tabId))) merged.set(item.tabId, { ...item, needsReview: true });
                    }
                    change([...merged.values()]);
                    return;
                }
                change(recoverTabUpdates(local.items, initial.bindings));
            }
        } catch {
            /* Malformed local recovery data can be ignored. */
        }
    }, [key, readOnly, initial.document.revision, initial.draftRevision, initial.bindings, initial.items, change]);
    const flush = () => {
        const next = tail.current
            .catch(() => {})
            .then(async () => {
                const snapshot = state.current;
                if (snapshot === saved.current || readOnly) return;
                const result = await executeActionClient<{ draftRevision: number }>(
                    'report.updates.save',
                    { ...input, expectedDraftRevision: revision.current, items: snapshot },
                    { organizationId },
                );
                revision.current = result.draftRevision;
                saved.current = snapshot;
                setError('');
                try {
                    if (snapshot === state.current) localStorage.removeItem(key);
                    else localStorage.setItem(key, JSON.stringify({ revision: revision.current, reportRevision: initial.document.revision, items: state.current }));
                } catch {
                    /* Best effort. */
                }
            });
        tail.current = next;
        return next;
    };
    const flushRef = useRef(flush);
    flushRef.current = flush;
    useEffect(() => {
        if (items === saved.current || readOnly) return;
        const timer = setTimeout(() => {
            void flushRef.current().catch(e => setError(e.message));
        }, 450);
        return () => clearTimeout(timer);
    }, [items, readOnly]);
    const submit = async (saveTabs: () => Promise<void>) => {
        if (lock.current || readOnly) return;
        lock.current = true;
        setBusy(true);
        setError('');
        try {
            await saveTabs();
            await flush();
            if (request.current?.revision !== revision.current) request.current = { revision: revision.current, id: crypto.randomUUID() };
            const value = await executeActionClient<{ revision: number; unchanged?: boolean; reason?: string; draftRevision?: number }>(
                'report.updates.commit',
                { ...input, expectedDraftRevision: revision.current, requestId: request.current.id },
                { organizationId },
            );
            try {
                localStorage.removeItem(key);
            } catch {
                /* Storage can be disabled. */
            }
            if (value.unchanged && value.draftRevision) {
                revision.current = value.draftRevision;
                saved.current = state.current = [];
                setItems(state.current);
            }
            return value;
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    return { items, state, change, flush, submit, busy, error, setError };
}
