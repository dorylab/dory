'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import type * as Monaco from 'monaco-editor';

import { vsPlusTheme } from '@/components/@dory/ui/monaco-editor/theme';
import { buildSqlEditorOptions, resolveSqlEditorTheme, type SqlEditorSettings } from '@/shared/stores/sql-editor-settings.store';
import { loadSqlMonaco } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/sql-editor/monaco-loader';

const PREVIEW_SQL = `SELECT
    o.order_id,
    o.amount,
    o.created_at
FROM orders AS o
WHERE o.status = 'completed'
ORDER BY o.created_at DESC
LIMIT 100;`;

export function EditorPreview({ settings }: { settings: SqlEditorSettings }) {
    const { resolvedTheme } = useTheme();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof Monaco | null>(null);
    const settingsRef = useRef(settings);
    const editorTheme = resolveSqlEditorTheme(settings, resolvedTheme);
    const editorThemeRef = useRef(editorTheme);

    settingsRef.current = settings;
    editorThemeRef.current = editorTheme;

    useEffect(() => {
        let disposed = false;
        let model: Monaco.editor.ITextModel | null = null;

        void loadSqlMonaco().then(monaco => {
            if (disposed || !containerRef.current) return;

            monacoRef.current = monaco;
            monaco.editor.defineTheme('github-dark', vsPlusTheme.darkThemeData);
            monaco.editor.defineTheme('github-light', vsPlusTheme.lightThemeData);
            monaco.editor.setTheme(editorThemeRef.current);
            model = monaco.editor.createModel(PREVIEW_SQL, 'sql');
            editorRef.current = monaco.editor.create(containerRef.current, {
                ...buildSqlEditorOptions(settingsRef.current),
                model,
                automaticLayout: true,
                contextmenu: false,
                domReadOnly: true,
                readOnly: true,
                tabIndex: -1,
                scrollBeyondLastLine: false,
                renderLineHighlight: 'none',
                minimap: { enabled: settingsRef.current.minimap, renderCharacters: false },
            });
        });

        return () => {
            disposed = true;
            editorRef.current?.dispose();
            editorRef.current = null;
            model?.dispose();
        };
    }, []);

    useEffect(() => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        if (!editor || !monaco) return;

        monaco.editor.setTheme(editorTheme);
        editor.updateOptions({
            ...buildSqlEditorOptions(settings),
            minimap: { enabled: settings.minimap, renderCharacters: false },
        });
    }, [editorTheme, settings]);

    return <div ref={containerRef} className="pointer-events-none mt-2 h-44 overflow-hidden rounded-md border bg-card" aria-label="SQL editor preview" />;
}
