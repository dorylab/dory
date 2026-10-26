'use client';

import type { ChatCompletion } from '@dory/shared/types/chat-completion';
import { useTranslations } from 'next-intl';
import { Button } from '@/registry/new-york-v4/ui/button';

export function ChatCompletionCard({
    completion,
    onContinue,
    onOpenReport,
    disabled,
}: {
    completion: ChatCompletion;
    onContinue?: () => void;
    onOpenReport?: (id: string) => void;
    disabled?: boolean;
}) {
    const t = useTranslations('AgentRuns.Chat.Completion');
    return (
        <section className="my-3 space-y-2 rounded-lg border border-border bg-muted/20 p-3 text-sm" data-testid="chat-completion">
            <p role="status" aria-live="polite" className="font-medium">
                {t(completion.status)}
            </p>
            {completion.report && (
                <p className="text-muted-foreground">
                    {t(completion.report.saved ? 'reportSaved' : completion.report.documentId ? 'reportPreserved' : 'reasons.REPORT_NOT_SAVED', {
                        revision: completion.report.revision ?? '',
                    })}
                </p>
            )}
            {completion.unfinished.length > 0 && (
                <details>
                    <summary className="cursor-pointer rounded-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring">{t('details')}</summary>
                    <ul className="mt-2 list-inside list-disc space-y-1">
                        {completion.unfinished.map(code => (
                            <li key={code}>{t(`reasons.${code}`)}</li>
                        ))}
                    </ul>
                </details>
            )}
            <div className="flex flex-wrap gap-2">
                {completion.report?.documentId && onOpenReport && (
                    <Button size="sm" variant="outline" onClick={() => onOpenReport(completion.report!.documentId)}>
                        {t('viewReport')}
                    </Button>
                )}
                {completion.canContinue && onContinue && (
                    <Button size="sm" variant="outline" disabled={disabled} onClick={onContinue}>
                        {t('continue')}
                    </Button>
                )}
            </div>
        </section>
    );
}
