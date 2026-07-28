'use client';

import { useEffect } from 'react';
import { useAtomValue } from 'jotai';

import { tableEditSessionsAtom } from './table-editor-store';

export function usePendingTableChangesBeforeUnload() {
    const editSessions = useAtomValue(tableEditSessionsAtom);

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            const hasPendingChanges = Object.values(editSessions).some(session => Object.keys(session.rows).length > 0);
            if (!hasPendingChanges) return;
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [editSessions]);
}
