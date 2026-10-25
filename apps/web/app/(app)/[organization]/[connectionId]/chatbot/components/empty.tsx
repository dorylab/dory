'use client';

import { useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Sparkles } from 'lucide-react';

import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion';
import { activeDatabaseAtom, activeSchemaAtom, currentConnectionAtom } from '@/shared/stores/app.store';

import { useSchema } from '@/hooks/use-schema';
import { getSidebarConfig } from '../../../components/sql-console-sidebar/sidebar-config';
import { getSchemaName } from '../../../components/sql-console-sidebar/utils';
import { AgentComposer } from '@/components/work-documents/agent-composer';
import type { ChatSubmission } from '@/lib/chat-context/types';
import { DatabaseSchemaSelect } from './database-schema-select';
import { createSuggestionFormatters, generateSuggestions } from './suggestion-rules';

type ChatWelcomeProps = {
    onSend: (message: ChatSubmission) => Promise<boolean | void> | boolean | void;
    disabled?: boolean;
};

const SUGGESTION_KEYS = ['TopUsers', 'ErrorLogs', 'OrderTrends', 'TableSummary'] as const;

export default function ChatWelcome({ onSend, disabled = false }: ChatWelcomeProps) {
    const t = useTranslations('Chatbot');
    const [input, setInput] = useState('');
    const sendLockRef = useRef(false);
    const [activeDatabase] = useAtom(activeDatabaseAtom);
    const activeSchema = useAtomValue(activeSchemaAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);

    const params = useParams();
    const connectionId = params.connectionId as string | undefined;
    const { schema } = useSchema(connectionId, activeDatabase);
    const sidebarConfig = useMemo(() => getSidebarConfig(currentConnection?.connection?.type), [currentConnection?.connection?.type]);

    const suggestions = useMemo(() => {
        const fallbacks = SUGGESTION_KEYS.map(key => t(`Welcome.Suggestions.${key}`));
        const schemaMap = schema?.schema;
        if (!schemaMap || !activeDatabase) return fallbacks;
        const formatters = createSuggestionFormatters(t);

        const allTables = Object.entries(schemaMap).map(([name, columns]) => ({
            name,
            columns,
        }));
        if (!allTables.length) return fallbacks;

        const filteredTables = sidebarConfig.supportsSchemas && activeSchema ? allTables.filter(table => getSchemaName(table.name, sidebarConfig) === activeSchema) : allTables;
        if (!filteredTables.length) return fallbacks;
        return generateSuggestions(filteredTables, fallbacks, formatters, 4);
    }, [schema, activeDatabase, activeSchema, sidebarConfig, t]);

    const handleSubmit = async (message: ChatSubmission) => {
        if (disabled || sendLockRef.current) return false;
        sendLockRef.current = true;
        try {
            return await onSend({ ...message, id: crypto.randomUUID() });
        } finally {
            sendLockRef.current = false;
        }
    };

    const handleSuggestionClick = (suggestion: string) => {
        if (disabled || sendLockRef.current) return;
        sendLockRef.current = true;
        Promise.resolve(onSend({ id: crypto.randomUUID(), text: suggestion, files: [] })).finally(() => {
            sendLockRef.current = false;
        });
    };
    return (
        <div className="flex h-full w-full flex-col items-center justify-center p-4">
            <div className="flex w-full max-w-2xl flex-col items-center gap-8">
                <div className="flex flex-col items-center gap-2 text-center">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-6 w-6 text-primary" />
                        <h1 className="text-2xl font-semibold tracking-tight">{t('Welcome.Heading')}</h1>
                    </div>
                    <p className="text-sm text-muted-foreground">{t('Welcome.Subheading')}</p>
                </div>

                <Suggestions className="justify-center flex-wrap">
                    {suggestions.map((text, i) => (
                        <Suggestion key={i} suggestion={text} onClick={handleSuggestionClick} disabled={disabled} />
                    ))}
                </Suggestions>

                <div className="w-full">
                    <AgentComposer
                        text={input}
                        onTextChange={setInput}
                        onSubmit={handleSubmit}
                        disabled={disabled}
                        sourceNames={connectionId ? { [connectionId]: currentConnection?.connection?.name ?? connectionId } : {}}
                        scope={{
                            connectionIds: connectionId ? [connectionId] : [],
                            databasesByConnection: connectionId && activeDatabase ? { [connectionId]: activeDatabase } : {},
                        }}
                    >
                        <div className="px-3 pt-2">
                            <DatabaseSchemaSelect />
                        </div>
                    </AgentComposer>
                </div>
            </div>
        </div>
    );
}
