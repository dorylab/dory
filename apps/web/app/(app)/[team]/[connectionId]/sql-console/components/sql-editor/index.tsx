'use client';

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { useTheme } from 'next-themes';

import { currentConnectionAtom } from '@/shared/stores/app.store';
import { resolveSqlEditorTheme, sqlEditorSettingsAtom } from '@/shared/stores/sql-editor-settings.store';
import type { UITabPayload } from '@/types/tabs';
import { useDebouncedTabSave } from './use-debounced-tab-save';
import { useMonacoTheme } from './use-monaco-theme';
import { useSqlMonacoEditor } from './use-sql-monaco-editor';
import { useSyncEditorContent } from './use-sync-editor-content';
import { SqlEditorContextMenu } from './sql-editor-context-menu';
import { useSqlEditorActions } from './use-sql-editor-actions';
import { useTranslations } from 'next-intl';

interface SQLEditorProps {
    activeTab: UITabPayload | undefined;
    updateTab: (tabId: string, patch: Partial<UITabPayload>) => void;
    onRunQuery?: () => void;
}

export interface SQLEditorHandle {
    getValue: () => string;
    flushSave: () => void;
    applyContentWithUndo?: (next: string) => void;
    focusAtEnd?: () => void;
}

const SQLEditor = forwardRef<SQLEditorHandle, SQLEditorProps>(({ activeTab, updateTab, onRunQuery }, ref) => {
    const { resolvedTheme } = useTheme();
    const currentConnection = useAtomValue(currentConnectionAtom);
    const editorSettings = useAtomValue(sqlEditorSettingsAtom);
    const editorTheme = resolveSqlEditorTheme(editorSettings, resolvedTheme);
    const t = useTranslations('SqlConsole');

    const containerRef = useRef<HTMLDivElement | null>(null);
    const { saveContent, flushSave } = useDebouncedTabSave(updateTab);
    const handleContentChange = useCallback(
        (tabId: string, content: string) => {
            saveContent(tabId, content);
        },
        [saveContent],
    );
    const formatHandlerRef = useRef<(() => void) | null>(null);

    const { editorRef, monacoRef } = useSqlMonacoEditor({
        activeTab,
        editorTheme,
        editorSettings,
        currentConnectionId: currentConnection?.connection.id,
        containerRef,
        onContentChange: handleContentChange,
        onRunQuery,
        onFormat: () => formatHandlerRef.current?.(),
    });

    useMonacoTheme(monacoRef, editorTheme);
    useSyncEditorContent(editorRef, activeTab);
    const {
        hasSelection,
        handleCopy,
        handlePaste,
        handleCut,
        handleFormat,
        handleToggleCase,
        handleExecuteSelection,
        handleExecuteSql,
    } = useSqlEditorActions({
        editorRef,
        onRunQuery,
        formatHandlerRef,
    });
    
    useImperativeHandle(
        ref,
        () => ({
            getValue: () =>
                editorRef.current?.getValue() ?? (activeTab?.tabType === 'sql' ? activeTab?.content ?? '' : ''),
            flushSave: () => flushSave(),
            applyContentWithUndo: (next: string) => {
                const editor = editorRef.current;
                const model = editor?.getModel();
                if (!editor || !model) return;

                const current = model.getValue();
                if (current === next) return;

                const fullRange = model.getFullModelRange();

                // Make the replacement a single undoable step.
                editor.pushUndoStop();
                editor.executeEdits('copilot.fix.apply', [{ range: fullRange, text: next }]);
                editor.pushUndoStop();
            },
            focusAtEnd: () => {
                const editor = editorRef.current;
                const model = editor?.getModel();
                if (!editor || !model) return;

                const lastLine = model.getLineCount();
                const lastColumn = model.getLineMaxColumn(lastLine);
                editor.setSelection({
                    startLineNumber: lastLine,
                    startColumn: lastColumn,
                    endLineNumber: lastLine,
                    endColumn: lastColumn,
                });
                editor.revealPositionInCenterIfOutsideViewport({ lineNumber: lastLine, column: lastColumn });
                editor.focus();
            },
        }),
        [activeTab?.tabType === 'sql' ? activeTab?.content : '', flushSave],
    );

    useEffect(() => {
        if (!activeTab || activeTab.tabType !== 'sql') return;

        let cancelled = false;
        let attempts = 0;

        const focusAtEnd = () => {
            if (cancelled) return;
            const editor = editorRef.current;
            const model = editor?.getModel();
            if (!editor || !model) {
                if (attempts < 5) {
                    attempts += 1;
                    setTimeout(focusAtEnd, 50);
                }
                return;
            }

            const lastLine = model.getLineCount();
            const lastColumn = model.getLineMaxColumn(lastLine);
            editor.setSelection({
                startLineNumber: lastLine,
                startColumn: lastColumn,
                endLineNumber: lastLine,
                endColumn: lastColumn,
            });
            editor.revealPositionInCenterIfOutsideViewport({ lineNumber: lastLine, column: lastColumn });
            editor.focus();
        };

        focusAtEnd();

        return () => {
            cancelled = true;
        };
    }, [activeTab?.tabId, activeTab?.tabType]);

    
    if (!activeTab) {
        return <div>{t('Editor.NoActiveTab')}</div>;
    }

    if (activeTab.tabType !== 'sql') {
        return <div>{t('Editor.NotSqlTab')}</div>;
    }

    return (
        <SqlEditorContextMenu
            hasSelection={hasSelection}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onCut={handleCut}
            onFormat={handleFormat}
            onToggleCase={handleToggleCase}
            onExecuteSelection={handleExecuteSelection}
            onExecuteSql={handleExecuteSql}
        >
            <div className="flex-1 min-h-0 sql-editor-container">
                <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
            </div>
        </SqlEditorContextMenu>
    );
});

SQLEditor.displayName = 'SQLEditor';
export default SQLEditor;
