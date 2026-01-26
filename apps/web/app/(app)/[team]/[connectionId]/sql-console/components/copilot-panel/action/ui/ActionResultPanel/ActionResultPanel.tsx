'use client';

import { ArrowLeft, Loader2 } from 'lucide-react';

import { Button } from '@/registry/new-york-v4/ui/button';
import { ActionResult } from '@/lib/copilot/action/types';
import { ActionToolsMenu } from './ActionToolsMenu';
import { ActionReview } from './ActionReview';
import { useTranslations } from 'next-intl';

type ActionResultPanelProps = {
    result?: ActionResult | null;
    originalSql?: string | null;
    actionTitle?: string | null;
    onBack?: () => void;
    onApply?: () => void;
    onUndoApply?: () => void;
    onCopy?: () => void;
    running?: boolean;
    errorMessage?: string | null;
    canUndoApply?: boolean;
};

type ActionHeaderProps = {
    title: string;
    onBack?: () => void;
};

type ActionSummaryProps = {
  title: string;
  explanation: string;
};

type ActionSqlPreviewProps = {
  sql: string;
};

export function ActionSummary({ title, explanation }: ActionSummaryProps) {
    return (
        <div className="flex flex-col gap-2 px-4 pt-4">
            <div className="text-sm font-medium text-foreground">{title}</div>
            <div className="text-xs text-muted-foreground">{explanation}</div>
        </div>
    );
}

export function ActionSqlPreview({ sql }: ActionSqlPreviewProps) {
    const t = useTranslations('SqlConsole');
    return (
        <div className="px-4 pt-3">
            <div className="rounded-lg border bg-muted/40 p-3">
                <div className="text-xs font-medium text-muted-foreground">{t('Copilot.Action.SqlPreview')}</div>
                <pre className="mt-2 max-h-64 overflow-auto text-xs leading-relaxed text-foreground">
                    {sql}
                </pre>
            </div>
        </div>
    );
}

export function ActionHeader({ title, onBack }: ActionHeaderProps) {
    return (
        <div className="flex items-center gap-2">
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onBack}
                disabled={!onBack}
            >
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
    );
}

export function ActionResultPanel({
    result,
    originalSql,
    actionTitle,
    onBack,
    onApply,
    onUndoApply,
    onCopy,
    running,
    errorMessage,
    canUndoApply,
}: ActionResultPanelProps) {
    const t = useTranslations('SqlConsole');
    const title = actionTitle ?? t('Copilot.Action.ResultTitle');
    const runningText = actionTitle ? t('Copilot.Action.RunningWithTitle', { title: actionTitle }) : t('Copilot.Action.Running');
    const isActionDisabled = running || !result || !!errorMessage;
    const undoButton =
        canUndoApply && onUndoApply ? (
            <button
                type="button"
                className="text-xs text-primary underline underline-offset-4 transition-colors hover:text-primary/80 disabled:opacity-50"
                onClick={onUndoApply}
                disabled={running}
            >
                {t('Copilot.Action.UndoApply')}
            </button>
        ) : null;

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between border-b px-4 py-3">
                <ActionHeader title={title} onBack={onBack} />
                <ActionToolsMenu />
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
                {running ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {runningText}
                    </div>
                ) : errorMessage ? (
                    <div className="flex h-full items-center justify-center px-4 py-6">
                        <div className="w-full rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                            {errorMessage}
                        </div>
                    </div>
                ) : result ? (
                    <>
                        <ActionSummary title={result.title} explanation={result.explanation} />
                        <ActionReview
                            original={originalSql ?? ''}
                            modified={result.fixedSql}
                            defaultView="diff"
                            onCopy={() => onCopy?.()}
                            onApply={() => onApply?.()}
                            copyDisabled={isActionDisabled}
                            applyDisabled={isActionDisabled}
                            headerRightSlot={undoButton}
                        />
                    </>
                ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        {t('Copilot.Action.EmptyResult')}
                    </div>
                )}
            </div>
            {/* <ActionResultBar onApply={onApply} onCopy={onCopy} disabled={isActionDisabled} /> */}
        </div>
    );
}
