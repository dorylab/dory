'use client';

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';

import type { ActionIntent, ActionResult, ActionContext } from '@/lib/copilot/action/types';
import { getLocalizedQuickActions, getQuickActionAvailability } from '@/lib/copilot/action/registry';
import { runQuickActionClient } from '@/lib/copilot/action/client/runQuickActionClient';

import { QuickActionList, QuickActionListItem } from './QuickActionList';
import { ActionResultPanel } from './ActionResultPanel/ActionResultPanel';
import { CopilotFixInput } from '@/app/(app)/[team]/[connectionId]/chatbot/copilot/types/copilot-fix-input';
import { useTranslations } from 'next-intl';

type ApplySqlResult = {
    previousSql: string;
};

type ApplySqlMeta = {
    intent?: ActionIntent;
    risk?: ActionResult['risk'];
    originalSql?: string;
    operation?: 'apply' | 'undo';
};

export type ActionTabProps = {
    input: CopilotFixInput | null;
    onApplySql?: (
        sql: string,
        meta?: ApplySqlMeta,
    ) => Promise<ApplySqlResult | void> | ApplySqlResult | void;
    onExecuted?: (payload: { intent: ActionIntent; result: ActionResult }) => void;
    autoRun?: { intent: ActionIntent; requestId: string } | null;
    onAutoRunHandled?: (requestId: string) => void;
};

export function ActionTab({ input, onApplySql, onExecuted, autoRun, onAutoRunHandled }: ActionTabProps) {
    const t = useTranslations('SqlConsole') as any;
    const [result, setResult] = useState<ActionResult | null>(null);
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState<string | null>(null);
    const [lastIntent, setLastIntent] = useState<ActionIntent | null>(null);
    const [showResultPanel, setShowResultPanel] = useState(false);
    const [undoSnapshot, setUndoSnapshot] = useState<ApplySqlResult | null>(null);
    const localizedActions = useMemo(() => getLocalizedQuickActions(t), [t]);
    const selectedActionTitle = useMemo(
        () => localizedActions.find(action => action.intent === lastIntent)?.title ?? null,
        [lastIntent, localizedActions],
    );

    const quickActions = useMemo<QuickActionListItem[]>(() => {
        if (!input) {
            return localizedActions.map(action => ({
                ...action,
                available: false,
                reason: t('Copilot.Actions.RequiresLastRun'),
            }));
        }

        const ctx: ActionContext = {
            dialect: input.lastExecution.dialect ?? 'unknown',
            sql: input.lastExecution.sql,
            database: input.lastExecution.database ?? undefined,
            error: input.lastExecution.error?.message
                ? {
                      message: input.lastExecution.error.message,
                      code: input.lastExecution.error.code ?? undefined,
                  }
                : undefined,
        };

        return getQuickActionAvailability(ctx, t).map(item => ({
            ...item.action,
            available: item.available,
            reason: item.reason,
        }));
    }, [input, localizedActions, t]);

    const autoRunHandledRef = useRef<string | null>(null);

    const handleSelect = useCallback(
        async (action: QuickActionListItem) => {
            if (!action?.available) return;

            setShowResultPanel(true);
            setLastIntent(action.intent);
            setRunError(null);
            setResult(null);
            setUndoSnapshot(null);

            if (!input) {
                setRunError(t('Copilot.Actions.NoExecutionInfo'));
                return;
            }

            setRunning(true);
            try {
                const r = await runQuickActionClient(action.intent, input);
                setResult(r);
                onExecuted?.({ intent: action.intent, result: r });
            } catch (e: any) {
                if (e?.code === 'MISSING_AI_ENV') {
                    setRunError(t('Copilot.Actions.MissingAiEnv'));
                } else {
                    setRunError(e?.message ?? t('Copilot.Actions.RunFailed'));
                }
            } finally {
                setRunning(false);
            }
        },
        [input, onExecuted, t],
    );

    useEffect(() => {
        if (!autoRun?.requestId) return;
        if (autoRunHandledRef.current === autoRun.requestId) return;

        autoRunHandledRef.current = autoRun.requestId;

        const action = quickActions.find(item => item.intent === autoRun.intent);
        if (!action) {
            setShowResultPanel(true);
            setLastIntent(autoRun.intent);
            setRunError(t('Copilot.Actions.NotApplicable'));
            onAutoRunHandled?.(autoRun.requestId);
            return;
        }

        if (!action.available) {
            setShowResultPanel(true);
            setLastIntent(action.intent);
            setRunError(action.reason ?? t('Copilot.Actions.NotApplicable'));
            onAutoRunHandled?.(autoRun.requestId);
            return;
        }

        void handleSelect(action).finally(() => {
            onAutoRunHandled?.(autoRun.requestId);
        });
    }, [autoRun, handleSelect, onAutoRunHandled, quickActions, t]);

    const handleBack = useCallback(() => {
        setResult(null);
        setRunError(null);
        setRunning(false);
        setLastIntent(null);
        setShowResultPanel(false);
        setUndoSnapshot(null);
    }, []);

    const handleCopy = useCallback(async () => {
        if (!result) return;
        await navigator.clipboard.writeText(result.fixedSql);
    }, [result]);

    const handleApply = useCallback(async () => {
        if (!result) return;
        setUndoSnapshot(null);
        try {
            const res = await onApplySql?.(result.fixedSql, {
                intent: lastIntent ?? undefined,
                risk: result.risk,
                originalSql: input?.lastExecution.sql,
                operation: 'apply',
            });
            if (res && typeof res === 'object' && 'previousSql' in res && typeof res.previousSql === 'string') {
                setUndoSnapshot({ previousSql: res.previousSql });
            }
        } catch (err) {
            console.error('[ActionTab.handleApply] Failed to apply SQL to editor', err);
        }
    }, [result, onApplySql, lastIntent, input?.lastExecution.sql]);

    const handleUndoApply = useCallback(async () => {
        if (!undoSnapshot) return;
        try {
            await onApplySql?.(undoSnapshot.previousSql, { intent: lastIntent ?? undefined, operation: 'undo' });
        } catch (err) {
            console.error('[ActionTab.handleUndoApply] Failed to undo applied SQL', err);
        } finally {
            setUndoSnapshot(null);
        }
    }, [lastIntent, onApplySql, undoSnapshot]);

    if (showResultPanel) {
        return (
            <ActionResultPanel
                result={result}
                originalSql={input?.lastExecution.sql}
                actionTitle={selectedActionTitle}
                running={running}
                errorMessage={runError}
                onBack={handleBack}
                onApply={handleApply}
                onCopy={handleCopy}
                onUndoApply={undoSnapshot ? handleUndoApply : undefined}
                canUndoApply={!!undoSnapshot}
            />
        );
    }

    return (
        <QuickActionList
            items={quickActions}
            onSelect={handleSelect}
            // loading={running}
            // errorMessage={runError}
        />
    );
}
