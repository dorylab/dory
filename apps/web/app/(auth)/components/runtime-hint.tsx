'use client';

import { useMemo } from 'react';
import { useEnvContext } from 'next-runtime-env';
import { cn } from '@dory/web-utils';

type RuntimeHintProps = {
    className?: string;
};

export function RuntimeHint({ className }: RuntimeHintProps) {
    const env = useEnvContext();

    const { runtime, cloudUrl } = useMemo(() => {
        const runtimeValue = (env?.NEXT_PUBLIC_DORY_RUNTIME ?? '').trim();
        const cloudValue = (env?.NEXT_PUBLIC_DORY_CLOUD_API_URL ?? '').trim();
        return {
            runtime: runtimeValue || 'web',
            cloudUrl: cloudValue || null,
        };
    }, [env]);

    if (process.env.NODE_ENV !== 'development') return null;

    if (!runtime && !cloudUrl) return null;

    const showCloud = runtime === 'desktop' && cloudUrl;
    let cloudHost: string | null = null;
    if (showCloud) {
        try {
            cloudHost = new URL(cloudUrl as string).host;
        } catch {
            cloudHost = null;
        }
    }

    return (
        <div
            className={cn(
                'pointer-events-none rounded-full border border-white/20 bg-black/50 px-3 py-1 text-[11px] uppercase tracking-wide text-white shadow-sm backdrop-blur',
                className,
            )}
        >
            <span>{runtime}</span>
            {showCloud && cloudHost ? <span className="ml-2 opacity-80">{cloudHost}</span> : null}
        </div>
    );
}
