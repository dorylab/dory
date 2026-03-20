'use client';

import { Button } from '@/registry/new-york-v4/ui/button';
import { RefreshCw, Sparkles } from 'lucide-react';
import { AISparkIcon } from '@/components/@dory/ui/ai-spark-icon';
import { useTranslations } from 'next-intl';

type OverviewHeaderProps = {
    loading: boolean;
    blocked: boolean;
    updatedAt: Date | null;
    onRefresh: () => void;
};

export function OverviewHeader({ loading, blocked, updatedAt, onRefresh }: OverviewHeaderProps) {
    const t = useTranslations('TableBrowser');
    return (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-semibold leading-tight mb-0">
                <AISparkIcon loading={loading || blocked} />
                <span>{t('Summary')}</span>
                {updatedAt ? (
                    <span className="text-xs font-normal text-muted-foreground">
                        {t('Updated at', { time: updatedAt.toLocaleTimeString() })}
                    </span>
                ) : null}
            </div>
            <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-muted-foreground"
                onClick={onRefresh}
                disabled={loading || blocked}
            >
                <RefreshCw className="mr-1 h-4 w-4" />
                {t('Regenerate')}
            </Button>
        </div>
    );
}
