'use client';

import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type * as Monaco from 'monaco-editor';

import type { UITabPayload } from '@/types/tabs';

export function useSyncEditorContent(
    editorRef: MutableRefObject<Monaco.editor.IStandaloneCodeEditor | null>,
    activeTab: UITabPayload | undefined,
) {
    useEffect(() => {
        if (!editorRef.current || !activeTab || activeTab.tabType !== 'sql') {
            return;
        }

        const model = editorRef.current.getModel();
        if (!model) return;

        const currentValue = model.getValue();
        const nextValue = activeTab.content ?? '';

        if (currentValue === nextValue) return;

        // Overwrite while keeping cursor positions when possible.
        model.pushEditOperations(
            [],
            [
                {
                    range: model.getFullModelRange(),
                    text: nextValue,
                },
            ],
            () => null,
        );
    }, [activeTab?.tabId, activeTab?.tabType, activeTab?.tabType === 'sql' && activeTab?.content, editorRef]);
}
