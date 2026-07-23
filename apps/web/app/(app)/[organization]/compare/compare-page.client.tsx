'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, DatabaseZap, Loader2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { schemaDialectFamily, type ComparisonEndpoint, type SchemaComparisonSummary } from '@dory/schema-compare';
import type { ConnectionListItem } from '@dory/shared/types/connections';

import { executeActionClient } from '@/lib/actions/client';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/registry/new-york-v4/ui/table';
import { useConnections } from '../connections/hooks/use-connections';

type EndpointDraft = {
    connectionId: string;
    identityId: string;
    database: string;
    schemas: string;
};

type ComparisonJob = {
    id: string;
    status: string;
    currentEndpoint: ComparisonEndpoint;
    desiredEndpoint: ComparisonEndpoint;
    dialectFamily: string;
    summary: SchemaComparisonSummary | null;
    createdAt: string | Date;
};

type ComparisonCreateOutput = {
    job: ComparisonJob & { resultSetId: string | null };
};

class ComparisonConnectionsChangedError extends Error {}

function isMissingComparisonConnectionError(error: unknown) {
    return error instanceof ComparisonConnectionsChangedError || (error instanceof Error && /comparison connections were not found/i.test(error.message));
}

function endpointFromDraft(draft: EndpointDraft): ComparisonEndpoint {
    const schemas = draft.schemas
        .split(',')
        .map(schema => schema.trim())
        .filter(Boolean);
    return {
        connectionId: draft.connectionId,
        identityId: draft.identityId || null,
        database: draft.database.trim(),
        schemas: schemas.length ? schemas : undefined,
    };
}

function defaultDraft(connection?: ConnectionListItem): EndpointDraft {
    const defaultIdentity = connection?.identities.find(identity => identity.isDefault) ?? connection?.identities[0];
    return {
        connectionId: connection?.connection.id ?? '',
        identityId: defaultIdentity?.id ?? '',
        database: defaultIdentity?.database ?? connection?.connection.database ?? '',
        schemas: '',
    };
}

function EndpointEditor({
    title,
    value,
    connections,
    onChange,
}: {
    title: string;
    value: EndpointDraft;
    connections: ConnectionListItem[];
    onChange: (value: EndpointDraft) => void;
}) {
    const t = useTranslations('SchemaCompare');
    const selected = connections.find(item => item.connection.id === value.connectionId);
    const selectedIdentityId = selected?.identities.some(identity => identity.id === value.identityId) ? value.identityId : '';
    const updateConnection = (connectionId: string) => {
        onChange(defaultDraft(connections.find(item => item.connection.id === connectionId)));
    };

    return (
        <Card className="min-w-0">
            <CardHeader className="pb-4">
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{t('Create.EndpointDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
                <div className="grid gap-2">
                    <Label>{t('Create.Connection')}</Label>
                    <Select value={selected ? value.connectionId : ''} onValueChange={updateConnection}>
                        <SelectTrigger data-testid={`${title.toLowerCase()}-connection`}>
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
                    <Label htmlFor={`${title}-database`}>{t('Create.Database')}</Label>
                    <Input
                        id={`${title}-database`}
                        value={value.database}
                        onChange={event => onChange({ ...value, database: event.target.value })}
                        placeholder={t('Create.DatabasePlaceholder')}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor={`${title}-schemas`}>{t('Create.Schemas')}</Label>
                    <Input
                        id={`${title}-schemas`}
                        value={value.schemas}
                        onChange={event => onChange({ ...value, schemas: event.target.value })}
                        placeholder={t('Create.SchemasPlaceholder')}
                    />
                    <p className="text-xs text-muted-foreground">{t('Create.SchemasHelp')}</p>
                </div>
            </CardContent>
        </Card>
    );
}

export function ComparePageClient({ organization }: { organization: string }) {
    const t = useTranslations('SchemaCompare');
    const router = useRouter();
    const connectionsQuery = useConnections();
    const supportedConnections = useMemo(() => (connectionsQuery.data ?? []).filter(item => schemaDialectFamily(item.connection.type)), [connectionsQuery.data]);
    const supportedConnectionById = useMemo(() => new Map(supportedConnections.map(item => [item.connection.id, item])), [supportedConnections]);
    const [current, setCurrent] = useState<EndpointDraft>(() => defaultDraft());
    const [desired, setDesired] = useState<EndpointDraft>(() => defaultDraft());
    const currentConnection = supportedConnectionById.get(current.connectionId);
    const desiredConnection = supportedConnectionById.get(desired.connectionId);
    const currentFamily = schemaDialectFamily(currentConnection?.connection.type ?? '');
    const desiredConnections = useMemo(
        () => (currentFamily ? supportedConnections.filter(item => schemaDialectFamily(item.connection.type) === currentFamily) : supportedConnections),
        [currentFamily, supportedConnections],
    );

    const comparisonsQuery = useQuery({
        queryKey: ['schema-comparisons', organization],
        queryFn: () => executeActionClient<{ rows: ComparisonJob[]; total: number }>('comparison.list', { limit: 30 }, { organizationId: organization }),
    });
    const createMutation = useMutation({
        mutationFn: async ({ currentDraft, desiredDraft }: { currentDraft: EndpointDraft; desiredDraft: EndpointDraft }) => {
            const refreshed = await connectionsQuery.refetch();
            if (refreshed.error) throw refreshed.error;

            const refreshedConnections = refreshed.data ?? [];
            const refreshedConnectionIds = new Set(refreshedConnections.map(item => item.connection.id));
            if (!refreshedConnectionIds.has(currentDraft.connectionId) || !refreshedConnectionIds.has(desiredDraft.connectionId)) {
                throw new ComparisonConnectionsChangedError();
            }

            return executeActionClient<ComparisonCreateOutput>(
                'comparison.schema.create',
                {
                    current: endpointFromDraft(currentDraft),
                    desired: endpointFromDraft(desiredDraft),
                },
                { organizationId: organization },
            );
        },
        onSuccess: output => {
            router.push(`/${encodeURIComponent(organization)}/compare/${encodeURIComponent(output.job.id)}`);
        },
        onError: async error => {
            if (isMissingComparisonConnectionError(error)) {
                if (!(error instanceof ComparisonConnectionsChangedError)) {
                    await connectionsQuery.refetch();
                }
                setCurrent(defaultDraft());
                setDesired(defaultDraft());
                toast.error(t('Errors.ConnectionChanged'));
                return;
            }
            toast.error(error instanceof Error ? error.message : t('Errors.CreateFailed'));
        },
    });
    const canCompare =
        Boolean(current.connectionId && desired.connectionId && current.database.trim() && desired.database.trim()) &&
        !connectionsQuery.isFetching &&
        currentFamily != null &&
        currentFamily === schemaDialectFamily(desiredConnection?.connection.type ?? '');

    return (
        <div className="bg-n8 h-screen overflow-auto">
            <main className="container mx-auto flex flex-col gap-6 px-12 pt-8 pb-12 lg:px-12 xl:px-8 2xl:px-4">
                <header>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <DatabaseZap className="h-4 w-4" />
                        {t('Eyebrow')}
                    </div>
                    <h1 className="mt-2 text-2xl font-semibold">{t('Title')}</h1>
                    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t('Description')}</p>
                </header>

                <section className="grid items-start gap-4 lg:grid-cols-[1fr_auto_1fr]">
                    <EndpointEditor
                        title={t('Current')}
                        value={current}
                        connections={supportedConnections}
                        onChange={next => {
                            setCurrent(next);
                            const nextFamily = schemaDialectFamily(supportedConnections.find(item => item.connection.id === next.connectionId)?.connection.type ?? '');
                            if (nextFamily !== schemaDialectFamily(supportedConnections.find(item => item.connection.id === desired.connectionId)?.connection.type ?? '')) {
                                setDesired(defaultDraft());
                            }
                        }}
                    />
                    <div className="hidden h-full items-center justify-center px-2 lg:flex">
                        <div className="rounded-full border bg-card p-2 text-muted-foreground">
                            <ArrowRight className="h-5 w-5" />
                        </div>
                    </div>
                    <EndpointEditor title={t('Desired')} value={desired} connections={desiredConnections} onChange={setDesired} />
                </section>

                <div className="flex justify-end">
                    <Button
                        onClick={() => createMutation.mutate({ currentDraft: current, desiredDraft: desired })}
                        disabled={!canCompare || createMutation.isPending}
                        data-testid="compare-schema"
                    >
                        {createMutation.isPending ? <Loader2 className="animate-spin" /> : <DatabaseZap />}
                        {t('Create.Compare')}
                    </Button>
                </div>

                <section className="rounded-lg border bg-card">
                    <div className="flex items-center justify-between border-b px-6 py-4">
                        <div>
                            <h2 className="font-medium">{t('Recent.Title')}</h2>
                            <p className="text-sm text-muted-foreground">{t('Recent.Description')}</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => comparisonsQuery.refetch()} disabled={comparisonsQuery.isFetching}>
                            <RefreshCw className={comparisonsQuery.isFetching ? 'animate-spin' : ''} />
                        </Button>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('Recent.Direction')}</TableHead>
                                <TableHead>{t('Recent.Family')}</TableHead>
                                <TableHead>{t('Recent.Changes')}</TableHead>
                                <TableHead>{t('Recent.Readiness')}</TableHead>
                                <TableHead>{t('Recent.Created')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(comparisonsQuery.data?.rows ?? []).map(job => (
                                <TableRow key={job.id} className="cursor-pointer" onClick={() => router.push(`/${encodeURIComponent(organization)}/compare/${job.id}`)}>
                                    <TableCell>
                                        <Link href={`/${encodeURIComponent(organization)}/compare/${job.id}`} className="font-medium hover:underline">
                                            {job.currentEndpoint.database} <ArrowRight className="mx-1 inline h-3.5 w-3.5" /> {job.desiredEndpoint.database}
                                        </Link>
                                    </TableCell>
                                    <TableCell>{job.dialectFamily}</TableCell>
                                    <TableCell>{job.summary?.totalChanges ?? '—'}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{job.summary?.readiness ?? job.status}</Badge>
                                    </TableCell>
                                    <TableCell>{new Date(job.createdAt).toLocaleString()}</TableCell>
                                </TableRow>
                            ))}
                            {!comparisonsQuery.isLoading && !comparisonsQuery.data?.rows.length ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                                        {t('Recent.Empty')}
                                    </TableCell>
                                </TableRow>
                            ) : null}
                        </TableBody>
                    </Table>
                </section>
            </main>
        </div>
    );
}
