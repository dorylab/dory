'use client';

import { Editor, loader, type EditorProps } from '@monaco-editor/react';
import { useTheme } from 'next-themes';

import { vsPlusTheme } from './theme';

loader.config({ paths: { vs: '/monaco-editor/min/vs' } });

export default function MonacoEditor({ language = 'mysql', beforeMount, theme, ...props }: EditorProps) {
    const { resolvedTheme } = useTheme();

    return (
        <Editor
            {...props}
            language={language}
            theme={theme ?? (resolvedTheme === 'dark' ? 'github-dark' : 'github-light')}
            beforeMount={monaco => {
                monaco.editor.defineTheme('github-dark', vsPlusTheme.darkThemeData);
                monaco.editor.defineTheme('github-light', vsPlusTheme.lightThemeData);
                beforeMount?.(monaco);
            }}
        />
    );
}
