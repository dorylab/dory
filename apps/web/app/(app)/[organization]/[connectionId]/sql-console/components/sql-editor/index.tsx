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
import { SqlEditorContextMenu } from './sql-editor-context-menu';
import { useSqlEditorActions } from './use-sql-editor-actions';
import { useTranslations } from 'next-intl';
import { InlineAskOverlay } from './inline-ask-overlay';

declare global {
    interface Window {
        __DORY_E2E_MONACO__?: {
            getValue: () => string;
            setValue: (value: string) => void;
            getModelCount: () => number;
            getSelection: () => {
                startLineNumber: number;
                startColumn: number;
                endLineNumber: number;
                endColumn: number;
            } | null;
            setSelection: (selection: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }) => void;
            getScrollTop: () => number;
            setScrollTop: (value: number) => void;
            undo: () => void;
        };
    }
}

interface SQLEditorProps {
    tabs: UITabPayload[];
    activeTab: UITabPayload | undefined;
    workspaceActive: boolean;
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
    getValue: (tabId?: string) => string;
    getValuesByTabId: () => Record<string, string>;
    flushSave: (tabId?: string) => void;
    applyContentWithUndo: (next: string, tabId?: string) => void;
    insertContentWithUndo: (next: string, tabId?: string) => string | null;
    focus: () => void;
}

const SQLEditor = forwardRef<SQLEditorHandle, SQLEditorProps>(
    (
        {
            tabs,
            activeTab,
            workspaceActive,
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
        const containerRef = useRef<HTMLDivElement | null>(null);
        const { saveContent, flushSave } = useDebouncedTabSave(updateTab);
        const previousTabIdRef = useRef<string | undefined>(activeTab?.tabId);
        const handleContentChange = useCallback(
            (tabId: string, content: string) => {
                saveContent(tabId, content);
            },
            [saveContent],
        );
        const formatHandlerRef = useRef<(() => void) | null>(null);

        const { editorRef, monacoRef, getModel, getValue, getValuesByTabId, modelsByTabRef, activeModelTabId } = useSqlMonacoEditor({
            tabs,
            activeTab,
            workspaceActive,
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
        const { hasSelection, handleCopy, handlePaste, handleCut, handleFormat, handleToggleCase, handleExecuteSelection, handleExecuteSql } = useSqlEditorActions({
            editorRef,
            currentConnectionType: currentConnection?.connection?.type,
            onRunQuery,
            formatHandlerRef,
        });

        useImperativeHandle(
            ref,
            () => ({
                getValue,
                getValuesByTabId,
                flushSave,
                applyContentWithUndo: (next: string, tabId?: string) => {
                    const editor = editorRef.current;
                    const model = getModel(tabId);
                    if (!model) return;

                    const current = model.getValue();
                    if (current === next) return;

                    const fullRange = model.getFullModelRange();

                    if (editor?.getModel() === model) {
                        editor.pushUndoStop();
                        editor.executeEdits('copilot.fix.apply', [{ range: fullRange, text: next }]);
                        editor.pushUndoStop();
                    } else {
                        model.pushStackElement();
                        model.pushEditOperations([], [{ range: fullRange, text: next }], () => null);
                        model.pushStackElement();
                    }
                },
                insertContentWithUndo: (next: string, tabId?: string) => {
                    const editor = editorRef.current;
                    const model = getModel(tabId);
                    if (!model) return null;

                    if (editor?.getModel() !== model) {
                        const position = model.getPositionAt(model.getValueLength());
                        model.pushStackElement();
                        model.pushEditOperations(
                            [],
                            [
                                {
                                    range: {
                                        startLineNumber: position.lineNumber,
                                        startColumn: position.column,
                                        endLineNumber: position.lineNumber,
                                        endColumn: position.column,
                                    },
                                    text: next,
                                },
                            ],
                            () => null,
                        );
                        model.pushStackElement();
                        return model.getValue();
                    }

                    const selection = editor.getSelection();
                    if (!selection) return null;

                    editor.pushUndoStop();
                    editor.executeEdits('copilot.inline-ask.insert', [{ range: selection, text: next }]);
                    editor.pushUndoStop();
                    editor.focus();

                    return model.getValue();
                },
                focus: () => editorRef.current?.focus(),
            }),
            [editorRef, flushSave, getModel, getValue, getValuesByTabId],
        );

        useEffect(() => {
            if (typeof window === 'undefined') return;

            window.__DORY_E2E_MONACO__ = {
                getValue,
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
                getModelCount: () => modelsByTabRef.current.size,
                getSelection: () => {
                    const selection = editorRef.current?.getSelection();
                    if (!selection) return null;
                    return {
                        startLineNumber: selection.startLineNumber,
                        startColumn: selection.startColumn,
                        endLineNumber: selection.endLineNumber,
                        endColumn: selection.endColumn,
                    };
                },
                setSelection: selection => editorRef.current?.setSelection(selection),
                getScrollTop: () => editorRef.current?.getScrollTop() ?? 0,
                setScrollTop: value => editorRef.current?.setScrollTop(value),
                undo: () => editorRef.current?.trigger('dory.e2e', 'undo', null),
            };

            return () => {
                if (window.__DORY_E2E_MONACO__) {
                    delete window.__DORY_E2E_MONACO__;
                }
            };
        }, [editorRef, getValue, modelsByTabRef]);

        useEffect(() => {
            const previousTabId = previousTabIdRef.current;
            if (previousTabId && previousTabId !== activeTab?.tabId) {
                flushSave(previousTabId);
            }
            previousTabIdRef.current = activeTab?.tabId;
        }, [activeTab?.tabId, activeTab?.tabType, flushSave]);

        if (!activeTab) {
            return <div>{t('Editor.NoActiveTab')}</div>;
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
                    {activeTab.tabType === 'sql' && activeModelTabId !== activeTab.tabId ? (
                        <div className="absolute inset-0 z-10 overflow-auto bg-card" data-testid="sql-editor-fallback">
                            {activeTab.content ? (
                                <pre className="min-h-full whitespace-pre-wrap px-14 py-1 font-mono text-sm leading-5 text-foreground">{activeTab.content}</pre>
                            ) : (
                                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('Editor.Loading')}</div>
                            )}
                        </div>
                    ) : null}
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
