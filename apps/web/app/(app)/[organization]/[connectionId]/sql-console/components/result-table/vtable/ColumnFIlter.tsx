'use client';
// ColumnFilter.tsx
import { useMemo, useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { cn } from '@dory/web-utils';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Filter, X } from 'lucide-react';
import { ColumnFilter } from './type';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from '@/registry/new-york-v4/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Label } from '@/registry/new-york-v4/ui/label';
import { useTranslations } from 'next-intl';

type FieldKind = 'string' | 'number' | 'boolean' | 'date';
type FilterDraft = { col: string; kind: 'string' | 'number'; op: any; value?: string; cs: boolean };

function normType(t?: string | null) {
    return (t ?? '').toLowerCase().replace(/\s+/g, '');
}

function mapDbTypeToKind(dbType?: string | null): FieldKind | undefined {
    const t = normType(dbType);
    if (!t) return;

    // boolean
    if (/(bool|boolean|uint1|bit\(1\)|tinyint\(1\))/.test(t)) return 'boolean';

    // number
    if (/(^|[^a-z])(int|integer|bigint|smallint|tinyint|float|double|decimal|numeric|real|money|serial|u?int\d*)([^a-z]|$)/.test(t)) return 'number';

    // date/time
    if (/(date|datetime|timestamp|time|year)/.test(t)) return 'date';

    if (/(char|text|uuid|json|map|array|tuple|object|string|variant)/.test(t)) return 'string';

    return;
}

export const ColumnFilterPopover = forwardRef<
    HTMLButtonElement,
    {
        column: string;
        columns: Array<{ name: string; type: string }>;
        draft: FilterDraft;
        setDraft: (updater: any) => void;
        existing?: ColumnFilter;
        onApply: (draft: FilterDraft) => void;
        onRemove: (col: string) => void;

        externalAnchor?: HTMLElement | null;

        externalOpenSignal?: number | string;
    }
>((props, ref) => {
    const { column, draft, setDraft, existing, onApply, onRemove, columns, externalAnchor, externalOpenSignal } = props;
    const triggerBtnRef = useRef<HTMLButtonElement | null>(null);
    const t = useTranslations('SqlConsole');

    useImperativeHandle(ref, () => triggerBtnRef.current!);

    const [open, setOpen] = useState(false);
    const [localDraft, setLocalDraft] = useState(draft);

    const effectiveKind: FieldKind = useMemo(() => {
        const colMeta = columns.find(c => c.name === column);
        const k = mapDbTypeToKind(colMeta?.type);
        return k ?? 'string';
    }, [columns, column]);

    const ops = useMemo(() => {
        if (effectiveKind === 'number') {
            return [
                { v: 'eq', label: '=' },
                { v: 'ne', label: '≠' },
                { v: 'gt', label: '>' },
                { v: 'ge', label: '≥' },
                { v: 'lt', label: '<' },
                { v: 'le', label: '≤' },
            ];
        }
        if (effectiveKind === 'boolean') {
            return [
                { v: 'isTrue', label: t('VTable.Filter.Op.IsTrue') },
                { v: 'isFalse', label: t('VTable.Filter.Op.IsFalse') },
            ];
        }
        if (effectiveKind === 'date') {
            return [
                { v: 'on', label: t('VTable.Filter.Op.On') },
                { v: 'before', label: t('VTable.Filter.Op.Before') },
                { v: 'after', label: t('VTable.Filter.Op.After') },
                { v: 'empty', label: t('VTable.Filter.Op.Empty') },
                { v: 'notEmpty', label: t('VTable.Filter.Op.NotEmpty') },
            ];
        }
        // string
        return [
            { v: 'contains', label: t('VTable.Filter.Op.Contains') },
            { v: 'equals', label: t('VTable.Filter.Op.Equals') },
            { v: 'startsWith', label: t('VTable.Filter.Op.StartsWith') },
            { v: 'endsWith', label: t('VTable.Filter.Op.EndsWith') },
            { v: 'empty', label: t('VTable.Filter.Op.Empty') },
            { v: 'notEmpty', label: t('VTable.Filter.Op.NotEmpty') },
            { v: 'regex', label: t('VTable.Filter.Op.Regex') },
        ];
    }, [effectiveKind, t]);

    useEffect(() => {
        const cur = String(localDraft.op);
        const allowed = ops.map(o => o.v);
        if (!allowed.includes(cur)) {
            setLocalDraft(current => ({ ...current, op: ops[0].v as any }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveKind]);

    const showValueInput = !['empty', 'notEmpty', 'isTrue', 'isFalse'].includes(String(localDraft.op)) && effectiveKind !== 'boolean';

    const inputType = effectiveKind === 'number' ? 'number' : effectiveKind === 'date' ? 'date' : 'text';

    function defaultOpForKind(k: FieldKind): any {
        return k === 'number' ? 'eq' : 'contains';
    }

    useEffect(() => {
        if (!externalAnchor) return;

        if (existing && existing.col === column) {
            const nextDraft = {
                ...draft,
                col: existing.col,
                kind: (existing.kind === 'number' ? 'number' : 'string') as 'number' | 'string',
                op: existing.op as any,
                value: existing.value ?? '',
                cs: !!existing.caseSensitive,
            };
            setDraft(nextDraft);
            setLocalDraft(nextDraft);
        } else {
            const mappedKind: 'number' | 'string' = effectiveKind === 'number' ? 'number' : 'string';
            const nextDraft = { ...draft, col: column, kind: mappedKind };
            setDraft(nextDraft);
            setLocalDraft(nextDraft);
        }

        setOpen(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [externalAnchor, externalOpenSignal]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            {externalAnchor && <PopoverAnchor virtualRef={{ current: externalAnchor }} />}

            {!externalAnchor && (
                <PopoverTrigger asChild>
                    <button
                        ref={triggerBtnRef}
                        type="button"
                        className={cn('mr-1 inline-flex items-center justify-center rounded p-1 hover:bg-white/10', existing && 'bg-white/10')}
                        onClick={() => {
                            const mappedKind: 'number' | 'string' = effectiveKind === 'number' ? 'number' : 'string';

                            if (existing && existing.col === column) {
                                const nextDraft = {
                                    ...draft,
                                    col: existing.col,
                                    kind: mappedKind,
                                    op: existing.op as any,
                                    value: existing.value ?? '',
                                    cs: !!existing.caseSensitive,
                                };
                                setDraft(nextDraft);
                                setLocalDraft(nextDraft);
                            } else {
                                const nextDraft = {
                                    ...draft,
                                    col: column,
                                    kind: mappedKind,
                                    op: defaultOpForKind(effectiveKind),
                                    value: '',
                                    cs: false,
                                };
                                setDraft(nextDraft);
                                setLocalDraft(nextDraft);
                            }

                            setOpen(true);
                        }}
                        title={t('VTable.Filter.Title')}
                    >
                        <Filter className="h-3.5 w-3.5" />
                    </button>
                </PopoverTrigger>
            )}

            <PopoverContent
                align="start"
                side="bottom"
                className="w-80"
                onKeyDown={event => event.stopPropagation()}
                onPaste={event => event.stopPropagation()}
                onMouseDown={event => event.stopPropagation()}
            >
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">{t('VTable.Filter.TitleWithColumn', { column })}</div>
                        {existing && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    onRemove(column);
                                    setOpen(false);
                                }}
                            >
                                <X className="h-4 w-4 mr-1" />
                                {t('VTable.Filter.Remove')}
                            </Button>
                        )}
                    </div>

                    <div className="space-y-1">
                        <Label>{t('VTable.Filter.Operator')}</Label>
                        <Select value={String(localDraft.op)} onValueChange={(v: any) => setLocalDraft(current => ({ ...current, op: v }))}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {ops.map(o => (
                                    <SelectItem key={o.v} value={o.v}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {showValueInput && (
                        <div className="space-y-2">
                            <div className="space-y-1">
                                <Label>{t('VTable.Filter.Value')}</Label>
                                <Input
                                    type={inputType}
                                    value={localDraft.value ?? ''}
                                    onChange={e => setLocalDraft(current => ({ ...current, value: e.target.value }))}
                                    placeholder={effectiveKind === 'date' ? t('VTable.Filter.PlaceholderDate') : t('VTable.Filter.PlaceholderText')}
                                />
                            </div>

                            {(effectiveKind === 'string' || effectiveKind === 'date') && (
                                <div className="flex items-center gap-2">
                                    <input
                                        id={`cs-${column}`}
                                        type="checkbox"
                                        className="h-4 w-4"
                                        checked={!!localDraft.cs}
                                        onChange={e => setLocalDraft(current => ({ ...current, cs: e.target.checked }))}
                                    />
                                    <Label htmlFor={`cs-${column}`}>{t('VTable.Filter.CaseSensitive')}</Label>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                            {t('VTable.Filter.Cancel')}
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => {
                                setDraft(localDraft);
                                onApply(localDraft);
                                setOpen(false);
                            }}
                        >
                            {t('VTable.Filter.Apply')}
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
});

ColumnFilterPopover.displayName = 'ColumnFilterPopover';
