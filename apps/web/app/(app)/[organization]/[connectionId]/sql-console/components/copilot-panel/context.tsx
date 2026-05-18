
'use client';

import { Copy } from 'lucide-react';

import type { CopilotEnvelopeV1 } from '../../../chatbot/copilot/types/copilot-envelope';
import type { CopilotResultSetContext } from '../../../chatbot/copilot/types/copilot-context-sql';
import { OverflowTooltip } from '@/components/overflow-tooltip';
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
    <div className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-start gap-2 text-sm">
        <span className="text-xs text-muted-foreground">{label}</span>
        <OverflowTooltip text={value || '-'} className="block min-w-0 truncate text-sm font-medium text-foreground" />
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
    const inferred = copilotEnvelope.context.draft.inferred;
    const isPostgres = copilotEnvelope.context.baseline.dialect === 'postgres';
    const tableLabel = inferred.tables.length ? inferred.tables.map(table => table.name).join(', ') : '-';

    return (
        <div className="space-y-2 rounded-md border bg-card px-4 py-3">
            <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-foreground">{t('Copilot.Context.EditorTitle')}</div>
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
                <div className="space-y-1.5 border-t pt-3 text-sm">
                    <SummaryRow
                        label={t('Copilot.Context.DatabaseLabel')}
                        value={inferred.database ?? t('Copilot.Context.EmptyValue')}
                        copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.DatabaseLabel') })}
                    />
                    {isPostgres ? (
                        <SummaryRow
                            label={t('Copilot.Context.SchemaLabel')}
                            value={inferred.schema ?? t('Copilot.Context.EmptyValue')}
                            copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.SchemaLabel') })}
                        />
                    ) : null}
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
        </div>
    );
};

function formatNumber(value: number | null | undefined) {
    return typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat().format(value) : null;
}

function formatRatio(value: number | null | undefined) {
    return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : null;
}

const ResultSetContext = ({ resultSet }: { resultSet?: CopilotResultSetContext | null }) => {
    const t = useTranslations('SqlConsole');
    if (!resultSet) return null;

    const summary = resultSet.stats?.summary ?? null;
    const profileColumns = Object.values(resultSet.stats?.columns ?? {}).slice(0, 6);
    const rowCount = resultSet.rowCount ?? summary?.rowCount ?? null;
    const columnCount = summary?.columnCount ?? resultSet.columns?.length ?? null;
    const isErrorResult = resultSet.status === 'error';
    const profileStatus = resultSet.stats
        ? t('Copilot.Context.ProfileReady')
        : isErrorResult
          ? t('Copilot.Context.ProfileNotApplicable')
          : t('Copilot.Context.ProfilePending');
    const errorCode = resultSet.errorCode == null ? null : String(resultSet.errorCode);

    return (
        <div className="space-y-3 rounded-md border bg-card px-4 py-3">
            <div className="text-sm font-medium text-foreground">{t('Copilot.Context.ResultSetTitle')}</div>
            <div className="space-y-1.5 text-sm">
                <SummaryRow
                    label={t('Copilot.Context.StatusLabel')}
                    value={resultSet.status ?? t('Copilot.Context.EmptyValue')}
                    copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.StatusLabel') })}
                />
                {resultSet.errorMessage ? (
                    <SummaryRow
                        label={t('Copilot.Context.ErrorMessageLabel')}
                        value={resultSet.errorMessage}
                        copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.ErrorMessageLabel') })}
                    />
                ) : null}
                {errorCode ? (
                    <SummaryRow
                        label={t('Copilot.Context.ErrorCodeLabel')}
                        value={errorCode}
                        copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.ErrorCodeLabel') })}
                    />
                ) : null}
                {resultSet.errorSqlState ? (
                    <SummaryRow
                        label={t('Copilot.Context.SqlStateLabel')}
                        value={resultSet.errorSqlState}
                        copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.SqlStateLabel') })}
                    />
                ) : null}
                {!isErrorResult ? (
                    <>
                        <SummaryRow
                            label={t('Copilot.Context.RowCountLabel')}
                            value={formatNumber(rowCount) ?? t('Copilot.Context.EmptyValue')}
                            copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.RowCountLabel') })}
                        />
                        <SummaryRow
                            label={t('Copilot.Context.ColumnCountLabel')}
                            value={formatNumber(columnCount) ?? t('Copilot.Context.EmptyValue')}
                            copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.ColumnCountLabel') })}
                        />
                        <SummaryRow
                            label={t('Copilot.Context.ProfileLabel')}
                            value={profileStatus}
                            copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.ProfileLabel') })}
                        />
                    </>
                ) : null}
                {summary?.kind ? (
                    <SummaryRow
                        label={t('Copilot.Context.ResultKindLabel')}
                        value={summary.kind}
                        copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.ResultKindLabel') })}
                    />
                ) : null}
                {summary?.recommendedChart ? (
                    <SummaryRow
                        label={t('Copilot.Context.ChartLabel')}
                        value={summary.recommendedChart}
                        copyLabel={t('Copilot.Context.CopyLabel', { label: t('Copilot.Context.ChartLabel') })}
                    />
                ) : null}
            </div>
            {profileColumns.length ? (
                <div className="space-y-2 border-t pt-3">
                    <div className="text-xs text-muted-foreground">{t('Copilot.Context.ProfileColumnsLabel')}</div>
                    <div className="space-y-2">
                        {profileColumns.map(profile => {
                            const details = [
                                profile.semanticRole,
                                profile.normalizedType,
                                profile.distinctCount != null ? t('Copilot.Context.DistinctShort', { value: formatNumber(profile.distinctCount) ?? String(profile.distinctCount) }) : null,
                                profile.topValueShare != null ? t('Copilot.Context.TopShareShort', { value: formatRatio(profile.topValueShare) ?? String(profile.topValueShare) }) : null,
                            ].filter(Boolean);

                            return (
                                <div key={profile.name} className="rounded-md bg-muted px-3 py-2">
                                    <div className="truncate text-xs font-medium text-foreground">{profile.name}</div>
                                    <div className="mt-1 truncate text-xs text-muted-foreground">{details.join(' / ')}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : null}
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
            {copilotEnvelope.surface === 'sql' ? <ResultSetContext resultSet={copilotEnvelope.context.resultSet} /> : null}
            <ContextTableFacts copilotEnvelope={copilotEnvelope} />
            {/* <ContextRaw copilotEnvelope={copilotEnvelope} sessionMeta={sessionMeta} activeTabCoreFields={activeTabCoreFields} /> */}
        </div>
    );
};

export default ContextTab;
