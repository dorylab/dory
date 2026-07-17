import type * as Monaco from 'monaco-editor';

type MonacoEnvironmentConfig = {
    getWorker?: (moduleId: string, label: string) => Worker;
};

let monacoModulePromise: Promise<typeof Monaco> | null = null;

function ensureMonacoWorkerFactory() {
    if (typeof window === 'undefined') return;

    const globalScope = globalThis as typeof globalThis & {
        MonacoEnvironment?: MonacoEnvironmentConfig;
    };

    if (typeof globalScope.MonacoEnvironment?.getWorker === 'function') return;

    globalScope.MonacoEnvironment = {
        ...globalScope.MonacoEnvironment,
        getWorker: () =>
            new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), {
                type: 'module',
                name: 'dory-monaco-editor-worker',
            }),
    };
}

export function loadSqlMonaco() {
    ensureMonacoWorkerFactory();
    monacoModulePromise ??= import('monaco-editor').catch(error => {
        monacoModulePromise = null;
        throw error;
    });
    return monacoModulePromise;
}

export function preloadSqlMonaco() {
    if (typeof window === 'undefined') return;
    void loadSqlMonaco();
}
