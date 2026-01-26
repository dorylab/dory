'use client';

import { Editor, EditorProps, Monaco } from '@monaco-editor/react';
import { loader } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import { vsPlusTheme } from './theme';

export default function MonacoEditor(props: EditorProps) {
    const monacoRef = useRef<Monaco | null>(null);
    const { theme } = useTheme();
    const language = props.language || 'mysql';

    // 只在浏览器环境配置 loader
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const loaderPath = `${window.location.origin}/monaco-editor/min/vs`;
        loader.config({ paths: { vs: loaderPath } });
    }, []);

    const onMount = (editor: any, monaco: Monaco) => {
        monacoRef.current = monaco;

        // 先调用你自己的 onMount
        props.onMount && props.onMount(editor, monaco);

        monaco.editor.defineTheme('github-dark', vsPlusTheme.darkThemeData);
        monaco.editor.defineTheme('github-light', vsPlusTheme.lightThemeData);
        monaco.editor.setTheme(theme === 'dark' ? 'github-dark' : 'github-light');
    };

    // 主题变化时切换 monaco 主题
    useEffect(() => {
        if (!monacoRef.current) return;
        monacoRef.current.editor.setTheme(theme === 'dark' ? 'github-dark' : 'github-light');
    }, [theme]);

    return <Editor language={language} {...props} onMount={onMount} />;
}
