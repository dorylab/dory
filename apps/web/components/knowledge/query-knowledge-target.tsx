'use client';

import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { executeActionClient } from '@/lib/actions/client';
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { Input } from '@/registry/new-york-v4/ui/input';

export function KnowledgeBaseCheckboxes({
    models,
    onChange,
    disabled,
}: {
    models: { id: string; name: string; checked: boolean }[];
    onChange: (id: string, checked: boolean) => void;
    disabled: boolean;
}) {
    return (
        <div className="max-h-36 space-y-2 overflow-y-auto p-1">
            {models.map(model => (
                <label key={model.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={model.checked} disabled={disabled} onCheckedChange={value => onChange(model.id, value === true)} />
                    {model.name}
                </label>
            ))}
        </div>
    );
}

export function useQueryKnowledgeTarget(connectionId: string | null, open: boolean) {
    const [enabled, setEnabled] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [newName, setNewName] = useState('');
    const models = useQuery({
        queryKey: ['knowledge-model-options', connectionId],
        enabled: open && enabled && Boolean(connectionId),
        queryFn: ({ signal }) => executeActionClient<{ models: { id: string; name: string }[] }>('knowledge.list', { connectionId }, { currentConnectionId: connectionId, signal }),
    });
    const available = models.data?.models ?? [];
    const knowledgeModelIds = available.filter(model => selectedIds.includes(model.id)).map(model => model.id);
    const newModelName = models.isSuccess && !available.length ? newName.trim() || undefined : undefined;
    return {
        enabled,
        setEnabled,
        setSelectedIds,
        setNewName,
        models,
        available,
        newName,
        knowledgeModelIds,
        newModelName,
        ready: !enabled || (models.isSuccess && Boolean(knowledgeModelIds.length || newModelName)),
    };
}

export function QueryKnowledgeTarget({ target, disabled }: { target: ReturnType<typeof useQueryKnowledgeTarget>; disabled: boolean }) {
    const t = useTranslations('SqlConsole.SaveSql');
    const tQueries = useTranslations('SqlConsole.SavedQueries');
    const id = useId();
    return (
        <div className="grid gap-3">
            <div className="flex items-start gap-2">
                <Checkbox id={id} checked={target.enabled} onCheckedChange={value => target.setEnabled(value === true)} disabled={disabled} />
                <div className="grid gap-1">
                    <label htmlFor={id} className="text-sm font-medium">
                        {t('AddToKnowledge')}
                    </label>
                    <p className="text-xs text-muted-foreground">{t('AddToKnowledgeDescription')}</p>
                </div>
            </div>
            {target.enabled && (
                <fieldset className="space-y-2 border-t pt-2" disabled={disabled}>
                    <legend className="text-sm font-medium">{tQueries('Memberships')}</legend>
                    {target.models.isPending ? (
                        <p className="text-sm text-muted-foreground">{t('LoadingDomains')}</p>
                    ) : target.models.isError ? (
                        <p className="text-sm text-destructive" role="alert">
                            {target.models.error.message}
                        </p>
                    ) : target.available.length ? (
                        <KnowledgeBaseCheckboxes
                            models={target.available.map(model => ({ ...model, checked: target.knowledgeModelIds.includes(model.id) }))}
                            onChange={(modelId, checked) => target.setSelectedIds(previous => (checked ? [...previous, modelId] : previous.filter(id => id !== modelId)))}
                            disabled={disabled}
                        />
                    ) : (
                        <Input
                            aria-label={t('NewDomainPlaceholder')}
                            value={target.newName}
                            onChange={event => target.setNewName(event.target.value)}
                            placeholder={t('NewDomainPlaceholder')}
                            maxLength={160}
                            disabled={disabled}
                        />
                    )}
                </fieldset>
            )}
        </div>
    );
}
