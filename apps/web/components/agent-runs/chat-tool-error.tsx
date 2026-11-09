'use client';

import { chatToolFailure } from '@dory/shared/types/chat-tool-error';
import { useTranslations } from 'next-intl';

/** The diagnostic remains in raw details; public tool rows show localized guidance. */
export function ChatToolError({ error, toolName }: { error: unknown; toolName: string }) {
    const t = useTranslations('AgentRuns.Chat');
    const failure = chatToolFailure(error, toolName);
    const key = /Repeated X values/i.test(failure.message) ? 'DuplicateChartX' : failure.code === 'REPORT_CONFLICT' ? 'ReportEditConflict' : failure.code;
    return (
        <p role="status" className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            {t(`ToolErrors.${key}`)}
        </p>
    );
}
