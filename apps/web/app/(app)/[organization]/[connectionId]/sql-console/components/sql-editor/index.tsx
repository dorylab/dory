'use client';

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { useTheme } from 'next-themes';

import { currentConnectionAtom } from '@/shared/stores/app.store';
import { resolveSqlEditorTheme, sqlEditorSettingsAtom } from '@/shared/stores/sql-editor-settings.store';
import type { UITabPayload } from '@dory/shared/types/tabs';
import { useDebouncedTabSave } from './use-debounced-tab-save';
import { useMonacoTheme } from './use-monaco-theme';
import { useSqlMonacoEditor } from './use-sql-monaco-editor';
import { useSyncEditorContent } from './use-sync-editor-content';
import { SqlEditorContextMenu } from './sql-editor-context-menu';
import { useSqlEditorActions } from './use-sql-editor-actions';
import { useTranslations } from 'next-intl';
import { InlineAskOverlay } from './inline-ask-overlay';

declare global {
    interface Window {
        __DORY_E2E_MONACO__?: {
            getValue: () => string;
            setValue: (value: string) => void;
        };
    }
}

interface SQLEditorProps {
    activeTab: UITabPayload | undefined;
    updateTab: (tabId: string, patch: Partial<UITabPayload>) => void;
    onRunQuery?: () => void;
    onNewTab?: () => void;
    onInlineAskOpen?: () => void;
    inlineAskMode?: boolean;
    inlineAskPromptDraft?: string;
    inlineAskGenerating?: boolean;
    inlineAskErrorMessage?: string | null;
    onInlineAskPromptChange?: (value: string) => void;
    onInlineAskSubmit?: () => void;
    onInlineAskCancel?: () => void;
}

export interface SQLEditorHandle {
    getValue: () => string;
    flushSave: () => void;
    applyContentWithUndo?: (next: string) => void;
    insertContentWithUndo?: (next: string) => string | null;
    focusAtEnd?: () => void;
}

const SQLEditor = forwardRef<SQLEditorHandle, SQLEditorProps>(
    (
        {
            activeTab,
            updateTab,
            onRunQuery,
            onNewTab,
            onInlineAskOpen,
            inlineAskMode = false,
            inlineAskPromptDraft = '',
            inlineAskGenerating = false,
            inlineAskErrorMessage = null,
            onInlineAskPromptChange,
            onInlineAskSubmit,
            onInlineAskCancel,
        },
        ref,
    ) => {
        const { resolvedTheme } = useTheme();
        const currentConnection = useAtomValue(currentConnectionAtom);
        const editorSettings = useAtomValue(sqlEditorSettingsAtom);
        const editorTheme = resolveSqlEditorTheme(editorSettings, resolvedTheme);
        const t = useTranslations('SqlConsole');
        const activeSqlContent = activeTab?.tabType === 'sql' ? (activeTab.content ?? '') : '';

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
            currentConnectionId: currentConnection?.connection?.id,
            currentConnectionType: currentConnection?.connection?.type,
            containerRef,
            onContentChange: handleContentChange,
            onRunQuery,
            onNewTab,
            onInlineAskOpen,
            onFormat: () => formatHandlerRef.current?.(),
        });

        useMonacoTheme(monacoRef, editorTheme);
        useSyncEditorContent(editorRef, activeTab);
        const { hasSelection, handleCopy, handlePaste, handleCut, handleFormat, handleToggleCase, handleExecuteSelection, handleExecuteSql } = useSqlEditorActions({
            editorRef,
            currentConnectionType: currentConnection?.connection?.type,
            onRunQuery,
            formatHandlerRef,
        });

        useImperativeHandle(
            ref,
            () => ({
                getValue: () => editorRef.current?.getValue() ?? activeSqlContent,
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
                insertContentWithUndo: (next: string) => {
                    const editor = editorRef.current;
                    const model = editor?.getModel();
                    const selection = editor?.getSelection();
                    if (!editor || !model || !selection) return null;

                    editor.pushUndoStop();
                    editor.executeEdits('copilot.inline-ask.insert', [{ range: selection, text: next }]);
                    editor.pushUndoStop();
                    editor.focus();

                    return model.getValue();
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
            [activeSqlContent, flushSave],
        );

        useEffect(() => {
            if (typeof window === 'undefined') return;

            window.__DORY_E2E_MONACO__ = {
                getValue: () => editorRef.current?.getValue() ?? activeSqlContent,
                setValue: (next: string) => {
                    const editor = editorRef.current;
                    const model = editor?.getModel();
                    if (!editor || !model) return;

                    const fullRange = model.getFullModelRange();
                    editor.pushUndoStop();
                    editor.executeEdits('dory.e2e', [{ range: fullRange, text: next }]);
                    editor.pushUndoStop();
                    editor.focus();
                },
            };

            return () => {
                if (window.__DORY_E2E_MONACO__) {
                    delete window.__DORY_E2E_MONACO__;
                }
            };
        }, [activeSqlContent, editorRef]);

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
                <div className="relative flex-1 min-h-0 sql-editor-container" data-testid="sql-editor">
                    <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
                    <InlineAskOverlay
                        open={inlineAskMode}
                        promptDraft={inlineAskPromptDraft}
                        isGenerating={inlineAskGenerating}
                        errorMessage={inlineAskErrorMessage}
                        onPromptChange={value => onInlineAskPromptChange?.(value)}
                        onSubmit={() => onInlineAskSubmit?.()}
                        onCancel={() => onInlineAskCancel?.()}
                    />
                </div>
            </SqlEditorContextMenu>
        );
    },
);

SQLEditor.displayName = 'SQLEditor';
export default SQLEditor;
