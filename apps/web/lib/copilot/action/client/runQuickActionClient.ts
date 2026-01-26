import type { ActionIntent, ActionResult } from '../types';
import type { CopilotFixInput } from '@/app/(app)/[team]/[connectionId]/chatbot/copilot/types/copilot-fix-input';
import { authFetch } from '@/lib/client/auth-fetch';
import { translate } from '@/lib/i18n/i18n';
import { getClientLocale } from '@/lib/i18n/client-locale';

type QuickActionError = Error & { code?: string };

export async function runQuickActionClient(intent: ActionIntent, input: CopilotFixInput): Promise<ActionResult> {
    const res = await authFetch('/api/copilot/action', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({ intent, input }),
    });

    if (!res.ok) {
        let message = translate(getClientLocale(), 'SqlConsole.Copilot.Errors.ActionFailed');
        let code: string | undefined;
        const contentType = res.headers.get('content-type') ?? '';

        if (contentType.includes('application/json')) {
            const data = (await res.json().catch(() => null)) as { message?: string; code?: string } | null;
            if (data?.message) message = data.message;
            if (data?.code) code = data.code;
        } else {
            const text = await res.text();
            if (text) message = text;
        }

        const error: QuickActionError = new Error(message);
        if (code) error.code = code;
        throw error;
    }

    return (await res.json()) as ActionResult;
}
