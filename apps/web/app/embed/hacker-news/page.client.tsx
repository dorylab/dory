'use client';

import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Database, Loader2, RotateCcw } from 'lucide-react';
import type { Locale } from '@dory/i18n/routing';

import { authClient } from '@/lib/auth-client';
import { captureEmbedDemoParentOrigin, postEmbedDemoEvent } from '@/lib/client/embed-demo-messaging';
import { Button } from '@/registry/new-york-v4/ui/button';

type BootstrapResponse = { organizationSlug: string; connectionId: string; expiresAt: string };

const copy: Record<Locale, { eyebrow: string; title: string; progress: string; error: string; retry: string }> = {
    en: {
        eyebrow: 'LIVE DATA WORKSPACE',
        title: 'Preparing the Hacker News demo',
        progress: 'Creating an isolated, read-only workspace…',
        error: "We couldn't start the live demo. Your regular Dory workspace was not changed.",
        retry: 'Try the live demo again',
    },
    zh: {
        eyebrow: '实时数据工作区',
        title: '正在准备 Hacker News Demo',
        progress: '正在创建隔离的只读工作区…',
        error: '实时 Demo 暂时无法启动。你的正式 Dory 工作区没有受到影响。',
        retry: '重新启动 Demo',
    },
    ja: {
        eyebrow: 'ライブデータワークスペース',
        title: 'Hacker News デモを準備しています',
        progress: '分離された読み取り専用ワークスペースを作成しています…',
        error: 'ライブデモを開始できませんでした。通常の Dory ワークスペースは変更されていません。',
        retry: 'デモを再試行',
    },
    es: {
        eyebrow: 'ESPACIO DE DATOS EN VIVO',
        title: 'Preparando la demo de Hacker News',
        progress: 'Creando un espacio aislado y de solo lectura…',
        error: 'No pudimos iniciar la demo. Tu espacio habitual de Dory no se modificó.',
        retry: 'Reintentar la demo',
    },
};

async function bootstrap(locale: Locale): Promise<BootstrapResponse> {
    let response = await fetch('/api/embed-demo/bootstrap', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
    });
    if (response.status === 401) {
        const result = await authClient.signIn.anonymous();
        if (result?.error) throw new Error(result.error.message || 'anonymous_sign_in_failed');
        response = await fetch('/api/embed-demo/bootstrap', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locale }),
        });
    }
    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.code || 'embed_demo_bootstrap_failed');
    }
    return response.json();
}

export function HackerNewsEmbedBootstrap({ locale }: { locale: Locale }) {
    const text = copy[locale];
    const mutation = useMutation({
        mutationFn: () => bootstrap(locale),
        onMutate: () => postEmbedDemoEvent('started'),
        onSuccess: data => {
            const destination = `/${encodeURIComponent(data.organizationSlug)}/${encodeURIComponent(data.connectionId)}/sql-console?embed=hacker-news&locale=${locale}`;
            window.location.replace(destination);
        },
        onError: error => postEmbedDemoEvent(error instanceof Error && error.message === 'EMBED_DEMO_LIMIT_REACHED' ? 'limit' : 'error'),
    });

    useEffect(() => {
        captureEmbedDemoParentOrigin();
        postEmbedDemoEvent('ready');
        mutation.mutate();
        // Bootstrap exactly once for this page load.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
            <div className="w-full max-w-xl border-y border-border py-10">
                <div className="flex items-center gap-3 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                    <Database className="size-4" />
                    {text.eyebrow}
                </div>
                <h1 className="mt-5 text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl">{text.title}</h1>
                {mutation.isError ? (
                    <div className="mt-6 space-y-5">
                        <p className="max-w-lg text-base leading-7 text-muted-foreground">{text.error}</p>
                        <Button type="button" variant="secondary" className="min-h-11 gap-2" onClick={() => mutation.mutate()}>
                            <RotateCcw className="size-4" />
                            {text.retry}
                            <ArrowRight className="size-4" />
                        </Button>
                    </div>
                ) : (
                    <div className="mt-6 flex items-center gap-3 text-sm text-muted-foreground" role="status" aria-live="polite">
                        <Loader2 className="size-4 animate-spin motion-reduce:animate-pulse" />
                        {text.progress}
                    </div>
                )}
            </div>
        </main>
    );
}
