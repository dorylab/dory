'use client';

import { useCallback, useEffect } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type * as Monaco from 'monaco-editor';
import { format as formatSql } from 'sql-formatter';

interface UseSqlEditorActionsProps {
    editorRef: RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
    onRunQuery?: () => void;
    formatHandlerRef: MutableRefObject<(() => void) | null>;
}

export function useSqlEditorActions({
    editorRef,
    onRunQuery,
    formatHandlerRef,
}: UseSqlEditorActionsProps) {
    const handleCopy = useCallback(() => {
        const editor = editorRef.current;
        if (!editor) return;

        const selection = editor.getSelection();
        if (selection) {
            const model = editor.getModel();
            if (model) {
                const text = model.getValueInRange(selection);
                navigator.clipboard.writeText(text);
            }
        }
    }, [editorRef]);

    const handleCut = useCallback(() => {
        const editor = editorRef.current;
        if (!editor) return;

        const selection = editor.getSelection();
        if (selection) {
            const model = editor.getModel();
            if (model) {
                const text = model.getValueInRange(selection);
                navigator.clipboard.writeText(text);
                editor.executeEdits('cut', [{ range: selection, text: '' }]);
            }
        }
    }, [editorRef]);

    const handlePaste = useCallback(async () => {
        const editor = editorRef.current;
        if (!editor) return;

        try {
            const text = await navigator.clipboard.readText();
            const selection = editor.getSelection();
            if (selection) {
                editor.executeEdits('paste', [{ range: selection, text }]);
            }
        } catch (err) {
            console.error('Failed to read clipboard:', err);
        }
    }, [editorRef]);

    const handleExecuteSelection = useCallback(() => {
        const editor = editorRef.current;
        if (!editor) return;

        const selection = editor.getSelection();
        if (selection) {
            const model = editor.getModel();
            if (model) {
                const text = model.getValueInRange(selection).trim();
                if (text && onRunQuery) {
                    onRunQuery();
                }
            }
        }
    }, [editorRef, onRunQuery]);

    const handleExecuteSql = useCallback(() => {
        if (onRunQuery) {
            onRunQuery();
        }
    }, [onRunQuery]);

    const handleFormat = useCallback(() => {
        const editor = editorRef.current;
        const model = editor?.getModel();
        if (!editor || !model) return;

        const selection = editor.getSelection();
        const hasSelection = selection && !selection.isEmpty();
        const input = hasSelection && selection ? model.getValueInRange(selection) : model.getValue();

        if (!input.trim()) return;

        const formatted = formatSql(input, { language: 'mysql' });
        if (formatted === input) return;

        editor.pushUndoStop();
        if (hasSelection && selection) {
            editor.executeEdits('format', [{ range: selection, text: formatted }]);
        } else {
            editor.executeEdits('format', [{ range: model.getFullModelRange(), text: formatted }]);
        }
        editor.pushUndoStop();
    }, [editorRef]);

    const applyCaseTransform = useCallback(
        (transform: (value: string) => string) => {
            const editor = editorRef.current;
            const model = editor?.getModel();
            if (!editor || !model) return;

            const selection = editor.getSelection();
            const hasSelection = selection && !selection.isEmpty();
            const input = hasSelection && selection ? model.getValueInRange(selection) : model.getValue();

            if (!input.trim()) return;

            const transformed = transform(input);
            if (transformed === input) return;

            editor.pushUndoStop();
            if (hasSelection && selection) {
                editor.executeEdits('case-transform', [{ range: selection, text: transformed }]);
            } else {
                editor.executeEdits('case-transform', [{ range: model.getFullModelRange(), text: transformed }]);
            }
            editor.pushUndoStop();
        },
        [editorRef],
    );

    const handleToggleCase = useCallback(() => {
        applyCaseTransform(value => {
            const hasLowercase = /[a-z]/.test(value);
            return hasLowercase ? value.toUpperCase() : value.toLowerCase();
        });
    }, [applyCaseTransform]);

    useEffect(() => {
        formatHandlerRef.current = handleFormat;
    }, [formatHandlerRef, handleFormat]);

    const getHasSelection = useCallback(() => {
        const editor = editorRef.current;
        if (!editor) return false;
        const selection = editor.getSelection();
        return !!selection && !selection.isEmpty();
    }, [editorRef]);

    const hasSelection = getHasSelection();

    return {
        hasSelection,
        handleCopy,
        handlePaste,
        handleCut,
        handleFormat,
        handleToggleCase,
        handleExecuteSelection,
        handleExecuteSql,
    };
}
