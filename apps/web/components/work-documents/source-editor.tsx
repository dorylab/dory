'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { vsPlusTheme } from '@/components/@dory/ui/monaco-editor/theme';
import type * as Monaco from 'monaco-editor';
import { loadSqlMonaco } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/sql-editor/monaco-loader';

export default function SourceEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    const host = useRef<HTMLDivElement>(null);
    const editor = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
    const latest = useRef({ value, onChange });
    latest.current = { value, onChange };
    const { resolvedTheme } = useTheme();
    const t = useTranslations('WorkDocuments');
    useEffect(() => {
        let disposed = false;
        let model: Monaco.editor.ITextModel | undefined;
        let subscription: Monaco.IDisposable | undefined;
        void loadSqlMonaco().then(monaco => {
            if (disposed || !host.current) return;
            monaco.editor.defineTheme('github-dark', vsPlusTheme.darkThemeData);
            monaco.editor.defineTheme('github-light', vsPlusTheme.lightThemeData);
            model = monaco.editor.createModel(latest.current.value, 'markdown');
            editor.current = monaco.editor.create(host.current, {
                model,
                // Keep text input consistent in Chromium and Electron.
                editContext: false,
                occurrencesHighlight: 'off',
                selectionHighlight: false,
                automaticLayout: true,
                wordWrap: 'on',
                minimap: { enabled: false },
                fontSize: 14,
                scrollBeyondLastLine: false,
                ariaLabel: t('SourceMode'),
                theme: resolvedTheme === 'dark' ? 'github-dark' : 'github-light',
            });
            subscription = model.onDidChangeContent(() => latest.current.onChange(model!.getValue()));
        });
        return () => {
            disposed = true;
            subscription?.dispose();
            editor.current?.dispose();
            editor.current = null;
            model?.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        if (editor.current?.getValue() !== value) editor.current?.setValue(value);
    }, [value]);
    useEffect(() => {
        editor.current?.updateOptions({ theme: resolvedTheme === 'dark' ? 'github-dark' : 'github-light' });
    }, [resolvedTheme]);
    return <div ref={host} className="h-[60vh] min-h-96 overflow-hidden rounded border" data-testid="markdown-source" />;
}
