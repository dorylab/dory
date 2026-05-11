'use client';

import { useCallback } from 'react';

import { authFetch } from '@/lib/client/auth-fetch';
import type { ConnectionType } from '@dory/shared/types/connections';
import type { CopilotEnvelopeV1 } from '../../chatbot/copilot/types/copilot-envelope';

type GenerateSqlFromPromptInput = {
    prompt: string;
    connectionId: string | null;
    connectionType: ConnectionType | null;
    database: string | null;
    activeSchema: string | null;
    candidateTables?: Array<{
        database?: string | null;
        schema?: string | null;
        name: string;
    }>;
    tabId: string;
    copilotEnvelope: CopilotEnvelopeV1;
    errorMessage: string;
};

export function useSqlInlineAskAI() {
    return useCallback(async (input: GenerateSqlFromPromptInput) => {
        const { prompt, connectionId, connectionType, database, activeSchema, candidateTables, copilotEnvelope, errorMessage } = input;

        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt) {
            throw new Error(errorMessage);
        }

        const res = await authFetch('/api/copilot/action/inline-ask', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: trimmedPrompt,
                editorSql: copilotEnvelope.surface === 'sql' ? copilotEnvelope.context.draft.editorText : '',
                database,
                activeSchema,
                candidateTables,
                connectionId,
                connectionType,
            }),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(text || errorMessage);
        }

        const data = (await res.json().catch(() => null)) as { sql?: string | null } | null;
        const sql = data?.sql;

        if (!sql?.trim()) {
            throw new Error(errorMessage);
        }

        return sql.trim();
    }, []);
}
