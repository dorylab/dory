'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Loader2, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { DEFAULT_SCHEMA_COMPARISON_OBJECT_TYPES, schemaDialectFamily, supportsSchemaComparison, type SchemaComparisonObjectType } from '@dory/schema-compare';
import type { ConnectionListItem } from '@dory/shared/types/connections';

import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { useConnections } from '@/app/(app)/[organization]/connections/hooks/use-connections';
import type { ComparisonClient, ComparisonMutationClient } from '@/lib/comparison/client-types';
import { executeActionClient } from '@/lib/actions/client';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';

type EndpointDraft = {
    connectionId: string;
    identityId: string;
    database: string;
};

function defaultEndpoint(connection?: ConnectionListItem): EndpointDraft {
    const identity = connection?.identities.find(item => item.isDefault) ?? connection?.identities[0];
    return {
        connectionId: connection?.connection.id ?? '',
        identityId: identity?.id ?? '',
        database: identity?.database ?? connection?.connection.database ?? '',
    };
}

function initialEndpoint(comparison: ComparisonClient | null, side: 'source' | 'target'): EndpointDraft {
    const endpoint = side === 'source' ? comparison?.sourceEndpoint : comparison?.targetEndpoint;
    return {
        connectionId: endpoint?.connectionId ?? '',
        identityId: endpoint?.identityId ?? '',
        database: endpoint?.database ?? '',
    };
}

function EndpointEditor({
    label,
    testId,
    value,
    connections,
    onChange,
}: {
    label: string;
    testId: string;
    value: EndpointDraft;
    connections: ConnectionListItem[];
    onChange: (value: EndpointDraft) => void;
}) {
    const t = useTranslations('SchemaCompare');
    const selected = connections.find(item => item.connection.id === value.connectionId);
    const selectedIdentityId = selected?.identities.some(identity => identity.id === value.identityId) ? value.identityId : '';

    return (
        <Card className="min-w-0">
            <CardHeader>
                <CardTitle className="text-base">{label}</CardTitle>
                <CardDescription>{t('Create.EndpointDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
                <div className="grid gap-2">
                    <Label>{t('Create.Connection')}</Label>
                    <Select
                        value={selected ? value.connectionId : ''}
                        onValueChange={connectionId => onChange(defaultEndpoint(connections.find(item => item.connection.id === connectionId)))}
                    >
                        <SelectTrigger data-testid={`${testId}-connection`}>
                            <SelectValue placeholder={t('Create.SelectConnection')} />
                        </SelectTrigger>
                        <SelectContent>
                            {connections.map(item => (
                                <SelectItem key={item.connection.id} value={item.connection.id}>
                                    <span className="flex items-center gap-2">
                                        <span>{item.connection.name}</span>
                                        {item.connection.environment ? <Badge variant="outline">{item.connection.environment}</Badge> : null}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-2">
                    <Label>{t('Create.Identity')}</Label>
                    <Select
                        value={selectedIdentityId || '__default__'}
                        onValueChange={identityId => onChange({ ...value, identityId: identityId === '__default__' ? '' : identityId })}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder={t('Create.DefaultIdentity')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__default__">{t('Create.DefaultIdentity')}</SelectItem>
                            {(selected?.identities ?? []).map(identity => (
                                <SelectItem key={identity.id} value={identity.id}>
                                    {identity.name || identity.username}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor={`${testId}-database`}>{t('Create.Database')}</Label>
                    <Input
                        id={`${testId}-database`}
                        value={value.database}
                        onChange={event => onChange({ ...value, database: event.target.value })}
                        placeholder={t('Create.DatabasePlaceholder')}
                    />
                </div>
            </CardContent>
        </Card>
    );
}

export function ComparisonForm({ organization, comparison = null }: { organization: string; comparison?: ComparisonClient | null }) {
    const t = useTranslations('SchemaCompare');
    const router = useRouter();
    const organizationId = useOrganizationId();
    const connectionsQuery = useConnections(organizationId);
    const supportedConnections = useMemo(() => (connectionsQuery.data ?? []).filter(item => supportsSchemaComparison(item.connection.type)), [connectionsQuery.data]);
    const [name, setName] = useState(comparison?.name ?? '');
    const [source, setSource] = useState<EndpointDraft>(() => initialEndpoint(comparison, 'source'));
    const [target, setTarget] = useState<EndpointDraft>(() => initialEndpoint(comparison, 'target'));
    const [schemaFilter, setSchemaFilter] = useState((comparison?.schemaFilter ?? []).join(', '));
    const [objectTypes, setObjectTypes] = useState<SchemaComparisonObjectType[]>(comparison?.objectTypes.length ? comparison.objectTypes : DEFAULT_SCHEMA_COMPARISON_OBJECT_TYPES);
    const sourceConnection = supportedConnections.find(item => item.connection.id === source.connectionId);
    const sourceFamily = schemaDialectFamily(sourceConnection?.connection.type ?? '');
    const targetConnections = sourceFamily ? supportedConnections.filter(item => schemaDialectFamily(item.connection.type) === sourceFamily) : supportedConnections;
    const targetFamily = schemaDialectFamily(targetConnections.find(item => item.connection.id === target.connectionId)?.connection.type ?? '');
    const showSchemaFilter = sourceFamily === 'postgres';
    const mutation = useMutation({
        mutationFn: () => {
            const configuration = {
                name,
                source: {
                    connectionId: source.connectionId,
                    identityId: source.identityId || null,
                    database: source.database.trim(),
                },
                target: {
                    connectionId: target.connectionId,
                    identityId: target.identityId || null,
                    database: target.database.trim(),
                },
                schemaFilter: showSchemaFilter
                    ? schemaFilter
                          .split(',')
                          .map(value => value.trim())
                          .filter(Boolean)
                    : [],
                objectTypes,
            };
            return comparison
                ? executeActionClient<ComparisonMutationClient>('comparison.update', { comparisonId: comparison.id, ...configuration }, { organizationId })
                : executeActionClient<ComparisonMutationClient>('comparison.create', configuration, { organizationId });
        },
        onSuccess: output => {
            router.push(`/${encodeURIComponent(organization)}/comparisons/${encodeURIComponent(output.comparison.id)}`);
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.CreateFailed')),
    });
    const canSave =
        name.trim().length > 0 &&
        source.connectionId.length > 0 &&
        target.connectionId.length > 0 &&
        source.database.trim().length > 0 &&
        target.database.trim().length > 0 &&
        sourceFamily != null &&
        sourceFamily === targetFamily &&
        objectTypes.length > 0 &&
        !connectionsQuery.isFetching;

    const updateSource = (next: EndpointDraft) => {
        setSource(next);
        const nextFamily = schemaDialectFamily(supportedConnections.find(item => item.connection.id === next.connectionId)?.connection.type ?? '');
        if (nextFamily !== targetFamily) setTarget(defaultEndpoint());
    };
    const toggleObjectType = (type: SchemaComparisonObjectType, checked: boolean) => {
        setObjectTypes(current => (checked ? [...new Set([...current, type])] : current.filter(value => value !== type)));
    };

    return (
        <form
            className="grid gap-6"
            onSubmit={event => {
                event.preventDefault();
                if (canSave) mutation.mutate();
            }}
        >
            <div className="grid gap-2">
                <Label htmlFor="comparison-name">{t('Create.Name')}</Label>
                <Input id="comparison-name" value={name} onChange={event => setName(event.target.value)} placeholder={t('Create.NamePlaceholder')} maxLength={160} autoFocus />
            </div>

            <section className="grid items-start gap-4 lg:grid-cols-[1fr_auto_1fr]">
                <EndpointEditor label={t('Source')} testId="source" value={source} connections={supportedConnections} onChange={updateSource} />
                <div className="hidden h-full items-center justify-center px-2 lg:flex">
                    <div className="rounded-full border bg-card p-2 text-muted-foreground">
                        <ArrowRight className="h-5 w-5" />
                    </div>
                </div>
                <EndpointEditor label={t('Target')} testId="target" value={target} connections={targetConnections} onChange={setTarget} />
            </section>

            {showSchemaFilter ? (
                <div className="grid gap-2">
                    <Label htmlFor="schema-filter">{t('Create.Schemas')}</Label>
                    <Input id="schema-filter" value={schemaFilter} onChange={event => setSchemaFilter(event.target.value)} placeholder={t('Create.SchemasPlaceholder')} />
                    <p className="text-xs text-muted-foreground">{t('Create.SchemasHelp')}</p>
                </div>
            ) : null}

            <div className="grid gap-3">
                <div>
                    <Label>{t('Create.CompareObjects')}</Label>
                    <p className="mt-1 text-xs text-muted-foreground">{t('Create.CompareObjectsHelp')}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {DEFAULT_SCHEMA_COMPARISON_OBJECT_TYPES.map(type => (
                        <label key={type} className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
                            <Checkbox checked={objectTypes.includes(type)} onCheckedChange={checked => toggleObjectType(type, checked === true)} />
                            {t(`Object.${type}`)}
                        </label>
                    ))}
                </div>
            </div>

            <div className="flex justify-end">
                <Button type="submit" disabled={!canSave || mutation.isPending} data-testid="save-comparison">
                    {mutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                    {comparison ? t('Create.SaveAndRun') : t('Create.Create')}
                </Button>
            </div>
        </form>
    );
}
