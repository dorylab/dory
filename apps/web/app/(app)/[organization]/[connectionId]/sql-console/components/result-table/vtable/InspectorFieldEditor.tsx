'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { KeyRound, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { cn } from '@dory/web-utils';
import { getCellEditorKind, getDateInputType, parseEditDraft, toDateEditDraft, toEditDraft } from './cell-editing';

export type InspectorColumnMeta = {
    name: string;
    type?: string | null;
    nullable?: boolean;
    isPrimaryKey?: boolean;
};

export type InspectorCellEditState = {
    editable: boolean;
    changed?: boolean;
    nullable?: boolean;
    readOnlyReason?: string;
};

type InspectorFieldEditorProps = {
    rowIndex: number;
    column: InspectorColumnMeta;
    value: unknown;
    state: InspectorCellEditState;
    onChange: (nextValue: unknown) => void;
    onRevert: () => void;
};

function pretty(value: unknown) {
    if (value == null) return '';
    return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}

export function InspectorFieldEditor({ rowIndex, column, value, state, onChange, onRevert }: InspectorFieldEditorProps) {
    const t = useTranslations('SqlConsole');
    const inputId = useId();
    const kind = getCellEditorKind(column.type);
    const initialDraft = kind === 'date' ? toDateEditDraft(value, column.type) : toEditDraft(value);
    const [draft, setDraft] = useState(initialDraft);
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const cancelledRef = useRef(false);
    const nullable = state.nullable ?? column.nullable ?? false;
    const readOnly = !state.editable || kind === 'complex';
    const helperText = error ?? (!state.editable && state.readOnlyReason ? state.readOnlyReason : '');
    const showFooter = Boolean(helperText) || (nullable && state.editable);

    useEffect(() => {
        setDraft(kind === 'date' ? toDateEditDraft(value, column.type) : toEditDraft(value));
        setDirty(false);
        setError(null);
    }, [column.type, kind, value]);

    const commitDraft = () => {
        if (!dirty || readOnly) return true;
        try {
            const nextValue = parseEditDraft(kind, draft, {
                chooseBoolean: t('VTable.Edit.ChooseBoolean'),
                invalidNumber: t('VTable.Edit.InvalidNumber'),
            });
            onChange(nextValue);
            setDirty(false);
            setError(null);
            return true;
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : String(nextError));
            return false;
        }
    };

    const handleBlur = () => {
        if (cancelledRef.current) {
            cancelledRef.current = false;
            return;
        }
        commitDraft();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            cancelledRef.current = true;
            setDraft(initialDraft);
            setDirty(false);
            setError(null);
            event.currentTarget.blur();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            commitDraft();
        }
    };

    const commonClassName = cn(
        'h-8 bg-background text-sm',
        state.changed && 'border-orange-500/60 bg-orange-500/5 focus-visible:ring-orange-500/30',
        value === null && 'text-muted-foreground',
    );

    return (
        <div
            data-testid="row-editor-field"
            data-column={column.name}
            data-changed={state.changed ? 'true' : undefined}
            className={cn('space-y-1.5 rounded-md border p-2.5', state.changed && 'border-orange-500/40 bg-orange-500/5')}
        >
            <div className="flex min-w-0 items-center justify-between gap-2">
                <label htmlFor={inputId} className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
                    {column.isPrimaryKey ? <KeyRound className="size-3.5 shrink-0 text-amber-500" aria-label={t('VTable.Inspector.PrimaryKey')} /> : null}
                    <span className="truncate">{column.name}</span>
                </label>
                <div className="flex shrink-0 items-center gap-1">
                    {state.changed ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="size-6 text-orange-700 hover:text-orange-800 dark:text-orange-300 dark:hover:text-orange-200"
                            aria-label={t('VTable.Inspector.RevertField', { field: column.name })}
                            onClick={onRevert}
                        >
                            <RotateCcw className="size-3.5" />
                        </Button>
                    ) : null}
                    <Badge variant="secondary" className="max-w-32 truncate px-1.5 py-0 text-[10px] font-normal text-muted-foreground" title={column.type ?? undefined}>
                        {column.type || t('VTable.Inspector.UnknownType')}
                    </Badge>
                </div>
            </div>

            {kind === 'complex' ? (
                <pre
                    className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground"
                    title={state.readOnlyReason}
                >
                    {pretty(value) || (value === null ? 'NULL' : '')}
                </pre>
            ) : kind === 'boolean' ? (
                <select
                    id={inputId}
                    value={draft}
                    disabled={readOnly}
                    aria-invalid={Boolean(error)}
                    className={cn(
                        commonClassName,
                        'w-full rounded-md border px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                    title={state.readOnlyReason}
                    onChange={event => {
                        setDraft(event.target.value);
                        setDirty(true);
                        setError(null);
                    }}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                >
                    {value === null ? <option value="">NULL</option> : null}
                    <option value="true">{t('VTable.Inspector.BooleanTrue')}</option>
                    <option value="false">{t('VTable.Inspector.BooleanFalse')}</option>
                </select>
            ) : (
                <Input
                    id={inputId}
                    type={kind === 'date' ? getDateInputType(column.type) : kind === 'number' ? 'number' : 'text'}
                    inputMode={kind === 'number' || kind === 'precise-number' ? 'decimal' : undefined}
                    value={draft}
                    disabled={readOnly}
                    placeholder={value === null ? 'NULL' : undefined}
                    aria-invalid={Boolean(error)}
                    className={commonClassName}
                    title={state.readOnlyReason}
                    onChange={event => {
                        setDraft(event.target.value);
                        setDirty(true);
                        setError(null);
                    }}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                />
            )}

            {showFooter ? (
                <div className="flex min-h-5 items-start justify-between gap-2">
                    <div className="min-w-0 text-[11px] leading-5 text-destructive" role={error ? 'alert' : undefined}>
                        {helperText}
                    </div>
                    {nullable && state.editable ? (
                        <Button
                            type="button"
                            variant={value === null ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-5 shrink-0 px-1.5 text-[11px]"
                            disabled={value === null}
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => {
                                onChange(null);
                                setDraft('');
                                setDirty(false);
                                setError(null);
                            }}
                        >
                            {value === null ? 'NULL' : t('VTable.Inspector.SetNull')}
                        </Button>
                    ) : null}
                </div>
            ) : null}
            <span className="sr-only">{t('VTable.Inspector.RowOnly', { row: rowIndex + 1 })}</span>
        </div>
    );
}
