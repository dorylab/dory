'use client';

import * as React from 'react';
import { CheckCircle2, ArrowRight, X } from 'lucide-react';

import ChatBotComp from '../../../chatbot/thread/chatbox';
import type { CopilotActionExecutor } from '../../../chatbot/copilot/action-bridge';
import type { CopilotEnvelopeV1 } from '../../../chatbot/copilot/types/copilot-envelope';
import type { useChatSessions } from '../../../chatbot/core/session-controller';

import { cn } from '@/lib/utils';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Separator } from '@/registry/new-york-v4/ui/separator';
import { useTranslations } from 'next-intl';

type CopilotChatSessions = ReturnType<typeof useChatSessions>;

type AskTabProps = {
  chat: CopilotChatSessions;
  copilotEnvelope: CopilotEnvelopeV1 | null;
  onExecuteAction?: CopilotActionExecutor;
  actionsState?: ActionsState | null;
  onGoToActions?: () => void;
  onGoToActionsRun?: (runId: string) => void;
};


function actionLabel(actionKey: string | undefined, t: ReturnType<typeof useTranslations>) {
  switch (actionKey) {
    case 'fix-sql-error':
      return t('Copilot.Ask.ActionLabels.FixSql');
    case 'optimize-performance':
      return t('Copilot.Ask.ActionLabels.Optimize');
    case 'rewrite-sql':
      return t('Copilot.Ask.ActionLabels.Rewrite');
    case 'to-aggregation':
      return t('Copilot.Ask.ActionLabels.ToAggregation');
    default:
      return t('Copilot.Ask.ActionLabels.Default');
  }
}

export type ActionsEvent = {
  type: 'action_applied' | 'action_generated' | 'action_undone';
  at: string;
  runId?: string;
  actionKey?: string;
};

export type ActionsState = {
  lastEvent?: ActionsEvent | null;
  activeAction?: string | null;
};

function extractActionsEvent(
  envelope: CopilotEnvelopeV1 | null,
  overrideState?: ActionsState | null,
): ActionsEvent | null {
  if (overrideState?.lastEvent) return overrideState.lastEvent;
  if (!envelope) return null;

  
  const anyEnv: any = envelope as any;
  const state =
    anyEnv?.context?.actionsState ??
    anyEnv?.context?.actions_state ??
    anyEnv?.actionsState ??
    null;

  const evt = state?.lastEvent ?? state?.last_event ?? null;
  if (!evt?.type || !evt?.at) return null;

  return {
    type: evt.type,
    at: evt.at,
    runId: evt.runId ?? evt.run_id,
    actionKey: state?.activeAction ?? state?.active_action ?? evt.actionKey,
  };
}

function AppliedBanner({
  event,
  onGoToActions,
  onGoToActionsRun,
}: {
  event: ActionsEvent;
  onGoToActions?: () => void;
  onGoToActionsRun?: (runId: string) => void;
}) {
  const t = useTranslations('SqlConsole');
  const key = React.useMemo(() => {
    
    return event.runId ? `applied:${event.runId}` : `applied:${event.type}:${event.at}`;
  }, [event]);

  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    
    if (event.type !== 'action_applied') return;

    const seenKey = `copilot.ask.banner.seen.${key}`;
    const seen = sessionStorage.getItem(seenKey);
    if (!seen) {
      setVisible(true);
      sessionStorage.setItem(seenKey, '1');
    }
  }, [event, key]);

  if (!visible) return null;

  return (
    <div className="mx-3 mt-3 rounded-lg border bg-muted/30 px-3 py-2">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">
            {t('Copilot.Ask.AppliedLabel', { action: actionLabel(event.actionKey, t) })}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t('Copilot.Ask.AppliedDescription')}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (event.runId && onGoToActionsRun) onGoToActionsRun(event.runId);
                else onGoToActions?.();
              }}
            >
              {t('Copilot.Ask.GoToActions')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>

        <button
          type="button"
          className={cn(
            'rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          )}
          onClick={() => setVisible(false)}
          aria-label={t('Actions.Close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

const AskTab = ({
  chat,
  copilotEnvelope,
  onExecuteAction,
  actionsState,
  onGoToActions,
  onGoToActionsRun,
}: AskTabProps) => {
  const evt = React.useMemo(() => extractActionsEvent(copilotEnvelope, actionsState), [copilotEnvelope, actionsState]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      
      {evt ? (
        <AppliedBanner event={evt} onGoToActions={onGoToActions} onGoToActionsRun={onGoToActionsRun} />
      ) : null}

      {/* <Separator className="mx-3 my-3" /> */}

      
      <div className="min-h-0 flex-1">
        <ChatBotComp
          key={copilotEnvelope?.meta?.tabId ?? 'copilot'}
          sessionId={chat.selectedSessionId}
          initialMessages={chat.initialMessages}
          mode="copilot"
          copilotEnvelope={copilotEnvelope}
          onExecuteAction={onExecuteAction}
          onConversationActivity={chat.handleConversationActivity}
          onSessionCreated={chat.setSelectedSessionId}
        />
      </div>
    </div>
  );
};

export default AskTab;
