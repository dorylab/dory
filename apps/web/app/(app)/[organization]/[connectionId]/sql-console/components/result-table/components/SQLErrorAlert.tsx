'use client';

import { Alert, AlertDescription, AlertTitle } from '@/registry/new-york-v4/ui/alert';
import { BorderBeamButton } from '@dory/ui/border-beam-button';
import { AlertCircle, SparkleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSetAtom } from 'jotai';
import { copilotActionRequestAtom, copilotPanelOpenAtom } from '../../../sql-console.store';

export function SQLErrorAlert({
    title,
    message,
    sql,
}: {
    title?: string;
    message: string | null | undefined;
    sql?: string | null;
}) {
    const t = useTranslations('SqlConsole');
    const setCopilotPanelOpen = useSetAtom(copilotPanelOpenAtom);
    const setCopilotActionRequest = useSetAtom(copilotActionRequestAtom);
    if (!message) return null;

    const handleAiFix = () => {
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setCopilotPanelOpen(true);
        setCopilotActionRequest({ id: requestId, intent: 'fix-sql-error' });
    };

    return (
        <Alert
            variant="destructive"
            className="border-none bg-transparent flex flex-col max-h-full"
            data-testid="sql-error-alert"
        >
            <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <AlertTitle className="flex items-center gap-2">
                    <span>{title ?? t('Errors.ExecuteFailed')}</span>
                    <BorderBeamButton
                        active
                        colorVariant="colorful"
                        type="button"
                        className="h-7 px-2 text-xs flex items-center gap-1 text-foreground hover:text-foreground"
                        onClick={handleAiFix}
                        size="sm"
                        variant="outline"
                    >
                        <SparkleIcon className="h-3.5 w-3.5" />
                        {t('Errors.AiFix')}
                    </BorderBeamButton>
                </AlertTitle>
            </div>

            <AlertDescription className="flex-1 overflow-auto mt-2">
                <pre className="whitespace-pre-wrap break-words text-sm">
                    {message}
                </pre>
            </AlertDescription>
        </Alert>
    );
}
