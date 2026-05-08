'use client';

import { useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Sparkles } from 'lucide-react';

import { PromptInput, PromptInputBody, PromptInputSubmit, PromptInputTextarea, PromptInputFooter, type PromptInputMessage } from '@/components/ai-elements/prompt-input';
import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion';
import { activeDatabaseAtom, activeSchemaAtom, currentConnectionAtom } from '@/shared/stores/app.store';
import { useTables } from '@/hooks/use-tables';
import { useSchema } from '@/hooks/use-schema';
import { getSidebarConfig } from '../../../components/sql-console-sidebar/sidebar-config';
import { getSchemaName } from '../../../components/sql-console-sidebar/utils';
import { TableMentionTextarea } from '../thread/table-mention-textarea';
import { DatabaseSchemaSelect } from './database-schema-select';
import { createSuggestionFormatters, generateSuggestions } from './suggestion-rules';

type ChatWelcomeProps = {
    onSend: (text: string) => Promise<void> | void;
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
    const { tables } = useTables(activeDatabase);
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

    const mentionTables = useMemo(() => {
        return (tables ?? []).filter(table => {
            if (!sidebarConfig.supportsSchemas || !activeSchema) {
                return true;
            }

            const tableName = (table as any).name ?? (table as any).value ?? (table as any).label ?? '';
            return getSchemaName(tableName, sidebarConfig) === activeSchema;
        });
    }, [activeSchema, sidebarConfig, tables]);

    const handleSubmit = (message: PromptInputMessage) => {
        if (disabled || sendLockRef.current) return;
        const text = message.text?.trim();
        if (!text) return;
        sendLockRef.current = true;
        Promise.resolve(onSend(text)).finally(() => {
            sendLockRef.current = false;
        });
    };

    const handleSuggestionClick = (suggestion: string) => {
        if (disabled || sendLockRef.current) return;
        sendLockRef.current = true;
        Promise.resolve(onSend(suggestion)).finally(() => {
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
                    <PromptInput onSubmit={handleSubmit} className="mt-1">
                        <PromptInputBody>
                            <div className="flex flex-col gap-2 w-full">
                                <div className="flex items-center gap-2">
                                    <DatabaseSchemaSelect />
                                </div>
                                <div className="flex items-start gap-2 w-full">
                                    <TableMentionTextarea
                                        value={input}
                                        onChange={setInput}
                                        tables={mentionTables.map((table: any) => table.name ?? table.value ?? table.label ?? table)}
                                        autoFocus
                                    >
                                        <PromptInputTextarea
                                            placeholder={t('Input.WelcomePlaceholder')}
                                            value={input}
                                            onChange={e => setInput(e.target.value)}
                                            autoFocus
                                            className="min-h-18 w-full resize-none border-0 bg-transparent text-sm focus-visible:outline-none focus-visible:ring-0"
                                        />
                                    </TableMentionTextarea>
                                </div>
                            </div>
                        </PromptInputBody>
                        <PromptInputFooter className="justify-end">
                            <PromptInputSubmit disabled={disabled || !input} />
                        </PromptInputFooter>
                    </PromptInput>
                </div>
            </div>
        </div>
    );
}
