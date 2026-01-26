
'use client';

import { Copy } from 'lucide-react';

import type { CopilotEnvelopeV1 } from '../../../chatbot/copilot/types/copilot-envelope';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/registry/new-york-v4/ui/accordion';
import { useTranslations } from 'next-intl';

type ContextTabProps = {
    copilotEnvelope: CopilotEnvelopeV1 | null;
    sessionMeta?: any;
    activeTabCoreFields?: Record<string, any> | null;
};

function safeJson(obj: any) {
    try {
        return JSON.stringify(obj, null, 2);
    } catch {
        return String(obj);
    }
}

function copyText(text: string) {
    if (!text) return;
    void navigator.clipboard?.writeText(text);
}

const SummaryRow = ({
    label,
    value,
    copyable,
    copyLabel,
}: {
    label: string;
    value: string;
    copyable?: boolean;
    copyLabel: string;
}) => (
    <div className="flex items-center gap-2 text-sm">
        <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
        <span className="truncate text-sm font-medium text-foreground">{value || '-'}</span>
        {copyable && value ? (
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => copyText(value)}
                title={copyLabel}
            >
                <Copy className="h-4 w-4" />
            </Button>
        ) : null}
    </div>
);

const SQLBlock = ({
    title,
    content,
    placeholder = 'None',
    copyLabel,
}: {
    title: string;
    content: string;
    placeholder?: string;
    copyLabel: string;
}) => (
    <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{title}</span>
            {content ? (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyText(content)} title={copyLabel}>
                    <Copy className="h-4 w-4" />
                </Button>
            ) : null}
        </div>
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs leading-snug">
            {content || placeholder}
        </pre>
    </div>
);

const ContextSQL = ({ copilotEnvelope }: { copilotEnvelope: CopilotEnvelopeV1 }) => {
    const t = useTranslations('SqlConsole');
    if (copilotEnvelope.surface !== 'sql') return null;

    const sqlText = copilotEnvelope.context.draft.editorText || '';
    const selection = copilotEnvelope.context.draft.selection;
    const selectionText =
        selection && selection.end > selection.start
            ? sqlText.slice(selection.start, selection.end)
            : '';

    return (
        <div className="space-y-2 rounded-md border bg-card px-4 py-3">
            <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-foreground">{t('Copilot.Context.SqlTitle')}</div>
            </div>
            <div className="space-y-3">
                <SQLBlock
                    title={t('Copilot.Context.SqlLabel')}
                    content={sqlText}
                    placeholder={t('Copilot.Context.SqlEmpty')}
                    copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.SqlLabel') })}
                />
                <SQLBlock
                    title={t('Copilot.Context.SelectionLabel')}
                    content={selectionText}
                    placeholder={t('Copilot.Context.None')}
                    copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.SelectionLabel') })}
                />
            </div>
        </div>
    );
};

const ContextInferred = ({ copilotEnvelope }: { copilotEnvelope: CopilotEnvelopeV1 }) => {
    const t = useTranslations('SqlConsole');
    if (copilotEnvelope.surface !== 'sql') return null;

    const inferred = copilotEnvelope.context.draft.inferred;
    const tableLabel = inferred.tables.length
        ? inferred.tables
              .map(table => [table.database, table.name].filter(Boolean).join('.'))
              .join(', ')
        : '-';

    return (
        <div className="space-y-2 rounded-md border bg-card px-4 py-3">
            <div className="text-sm font-medium text-foreground">{t('Copilot.Context.InferredTitle')}</div>
            <div className="space-y-1.5 text-sm">
                <SummaryRow
                    label={t('Copilot.Context.DatabaseLabel')}
                    value={inferred.database ?? t('Copilot.Context.EmptyValue')}
                    copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.DatabaseLabel') })}
                />
                <SummaryRow
                    label={t('Copilot.Context.TablesLabel')}
                    value={tableLabel || t('Copilot.Context.EmptyValue')}
                    copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.TablesLabel') })}
                />
                <SummaryRow
                    label={t('Copilot.Context.ConfidenceLabel')}
                    value={inferred.confidence}
                    copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.ConfidenceLabel') })}
                />
            </div>
        </div>
    );
};

const ContextTableFacts = ({ copilotEnvelope }: { copilotEnvelope: CopilotEnvelopeV1 }) => {
    const t = useTranslations('SqlConsole');
    if (copilotEnvelope.surface !== 'table') return null;

    const rowCount = copilotEnvelope.context.table.rowCount ?? null;
    const primaryKey = copilotEnvelope.context.table.primaryKey ?? null;
    const schema = copilotEnvelope.context.table.schema;
    const tableName = copilotEnvelope.context.table.name;

    return (
        <div className="space-y-2 rounded-md border bg-card px-4 py-3">
            <div className="text-sm font-medium text-foreground">{t('Copilot.Context.TableFactsTitle')}</div>
            <div className="space-y-1.5 text-sm">
                <SummaryRow
                    label={t('Copilot.Context.RowCountLabel')}
                    value={rowCount != null ? String(rowCount) : t('Copilot.Context.EmptyValue')}
                    copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.RowCountLabel') })}
                />
                <SummaryRow
                    label={t('Copilot.Context.PrimaryKeyLabel')}
                    value={primaryKey || t('Copilot.Context.EmptyValue')}
                    copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.PrimaryKeyLabel') })}
                />
                {schema || tableName ? (
                    <SummaryRow
                        label={t('Copilot.Context.TableLabel')}
                        value={[schema, tableName].filter(Boolean).join('.')}
                        copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.TableLabel') })}
                    />
                ) : null}
            </div>
        </div>
    );
};

const ContextRaw = ({
    copilotEnvelope,
    sessionMeta,
    activeTabCoreFields,
}: {
    copilotEnvelope: CopilotEnvelopeV1;
    sessionMeta?: any;
    activeTabCoreFields?: Record<string, any> | null;
}) => {
    const t = useTranslations('SqlConsole');
    const bundle = { copilotEnvelope, sessionMeta: sessionMeta ?? null, activeTabCoreFields: activeTabCoreFields ?? null };
    return (
        <div className="rounded-md border bg-card px-2 py-1.5">
            <Accordion type="multiple" className="w-full">
                <AccordionItem value="copilot">
                    <AccordionTrigger className="text-sm font-medium">{t('Copilot.Context.RawCopilot')}</AccordionTrigger>
                    <AccordionContent>
                        <div className="flex justify-end pb-2">
                            <Button variant="outline" size="sm" className="h-8" onClick={() => copyText(safeJson(copilotEnvelope))}>
                                <Copy className="mr-2 h-4 w-4" />
                                {t('Copilot.Context.CopyJson')}
                            </Button>
                        </div>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs leading-snug">
                            {safeJson(copilotEnvelope)}
                        </pre>
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="bundle">
                    <AccordionTrigger className="text-sm font-medium">{t('Copilot.Context.RawBundle')}</AccordionTrigger>
                    <AccordionContent>
                        <div className="flex justify-end pb-2">
                            <Button variant="outline" size="sm" className="h-8" onClick={() => copyText(safeJson(bundle))}>
                                <Copy className="mr-2 h-4 w-4" />
                                {t('Copilot.Context.CopyJson')}
                            </Button>
                        </div>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs leading-snug">
                            {safeJson(bundle)}
                        </pre>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
};

const ContextTab = ({ copilotEnvelope, sessionMeta, activeTabCoreFields }: ContextTabProps) => {
    const t = useTranslations('SqlConsole');
    if (!copilotEnvelope) {
        return (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                {t('Copilot.Context.NotReady')}
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto px-4 py-3 text-sm">
            <ContextSQL copilotEnvelope={copilotEnvelope} />
            <ContextInferred copilotEnvelope={copilotEnvelope} />
            <ContextTableFacts copilotEnvelope={copilotEnvelope} />
            {/* <ContextRaw copilotEnvelope={copilotEnvelope} sessionMeta={sessionMeta} activeTabCoreFields={activeTabCoreFields} /> */}
        </div>
    );
};

export default ContextTab;
