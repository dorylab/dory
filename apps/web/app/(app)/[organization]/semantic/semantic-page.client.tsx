'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrainCircuit, FileCode2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { ConnectionListItem } from '@dory/shared/types/connections';
import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';

type Definition = { id: string; name: string; kind: 'entity' | 'metric' | 'measure' | 'dimension' | 'relationship'; description?: string; source?: string; expression?: string; filters?: string[]; aliases?: string[] };
type Context = { id: string; connectionId: string; businessContextMd: string; modelYaml: string; model: { definitions: Definition[] } };
type VerifiedQuery = { id: string; title: string; question: string; sql: string; description: string | null; sourceType: string; createdAt: string };

const contextKey = (connectionId: string) => ['semantic', connectionId] as const;

function DefinitionEditor({ context, connectionId }: { context: Context; connectionId: string }) {
    const queryClient = useQueryClient();
    const [name, setName] = useState('');
    const [kind, setKind] = useState<Definition['kind']>('metric');
    const [source, setSource] = useState('');
    const [expression, setExpression] = useState('');
    const [description, setDescription] = useState('');
    const save = useMutation({ mutationFn: (definitions: Definition[]) => executeActionClient<Context>('semantic.saveModel', { connectionId, definitions }, { currentConnectionId: connectionId }), onSuccess: data => { queryClient.setQueryData(contextKey(connectionId), data); setName(''); setSource(''); setExpression(''); setDescription(''); }, onError: error => toast.error(error instanceof Error ? error.message : 'Could not save definition.') });
    const add = () => { if (!name.trim()) return; save.mutate([...context.model.definitions, { id: `${kind}:${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, name, kind, source: source || undefined, expression: expression || undefined, description: description || undefined }]); };
    const remove = (id: string) => save.mutate(context.model.definitions.filter(item => item.id !== id));
    return <div className="space-y-5"><Card><CardHeader><CardTitle className="text-base">Add definition</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2"><Input value={name} onChange={event => setName(event.target.value)} placeholder="Revenue" /><select className="border-input bg-background h-9 rounded-md border px-3 text-sm" value={kind} onChange={event => setKind(event.target.value as Definition['kind'])}>{['metric', 'measure', 'dimension', 'entity', 'relationship'].map(value => <option key={value}>{value}</option>)}</select><Input value={source} onChange={event => setSource(event.target.value)} placeholder="Source, e.g. orders" /><Input value={expression} onChange={event => setExpression(event.target.value)} placeholder="Calculation, e.g. SUM(amount)" /><Textarea className="md:col-span-2" value={description} onChange={event => setDescription(event.target.value)} placeholder="Business definition" /><div className="md:col-span-2"><Button onClick={add} disabled={save.isPending}><Plus className="mr-2 h-4 w-4" />Add Definition</Button></div></CardContent></Card><div className="space-y-2">{context.model.definitions.map(definition => <Card key={definition.id}><CardContent className="flex items-start justify-between gap-4 py-4"><div><div className="font-medium">{definition.name} <span className="text-muted-foreground text-xs">{definition.kind}</span></div><p className="text-muted-foreground text-sm">{definition.description || definition.expression || definition.source || 'No description'}</p></div><Button variant="ghost" size="icon-sm" aria-label={`Delete ${definition.name}`} onClick={() => remove(definition.id)}><Trash2 className="h-4 w-4" /></Button></CardContent></Card>)}</div></div>;
}

function SemanticDetail({ connectionId }: { connectionId: string }) {
    const queryClient = useQueryClient();
    const [markdown, setMarkdown] = useState('');
    const [yaml, setYaml] = useState('');
    const [question, setQuestion] = useState('');
    const [title, setTitle] = useState('');
    const [sql, setSql] = useState('');
    const context = useQuery({ queryKey: contextKey(connectionId), queryFn: () => executeActionClient<Context>('semantic.get', { connectionId }, { currentConnectionId: connectionId }) });
    const queries = useQuery({ queryKey: [...contextKey(connectionId), 'queries'], queryFn: () => executeActionClient<{ queries: VerifiedQuery[] }>('semantic.listVerifiedQueries', { connectionId }, { currentConnectionId: connectionId }) });
    const invalidate = () => { void queryClient.invalidateQueries({ queryKey: contextKey(connectionId) }); };
    const saveMarkdown = useMutation({ mutationFn: () => executeActionClient<Context>('semantic.updateBusinessContext', { connectionId, businessContextMd: markdown }, { currentConnectionId: connectionId }), onSuccess: data => { queryClient.setQueryData(contextKey(connectionId), data); toast.success('Business context saved.'); } });
    const importYaml = useMutation({ mutationFn: () => executeActionClient<Context>('semantic.importYaml', { connectionId, source: yaml }, { currentConnectionId: connectionId }), onSuccess: data => { queryClient.setQueryData(contextKey(connectionId), data); toast.success('Cube YAML imported.'); } });
    const createQuery = useMutation({ mutationFn: () => executeActionClient('semantic.createVerifiedQuery', { connectionId, title, question, sql, sourceType: 'manual' }, { currentConnectionId: connectionId }), onSuccess: () => { setTitle(''); setQuestion(''); setSql(''); void queryClient.invalidateQueries({ queryKey: [...contextKey(connectionId), 'queries'] }); } });
    const deleteQuery = useMutation({ mutationFn: (id: string) => executeActionClient('semantic.deleteVerifiedQuery', { connectionId, id }, { currentConnectionId: connectionId }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: [...contextKey(connectionId), 'queries'] }) });
    if (context.isLoading) return <div className="p-8 text-muted-foreground">Loading Semantic Context…</div>;
    if (context.isError || !context.data) return <div className="p-8 text-destructive">Semantic Context could not be loaded.</div>;
    const data = context.data;
    return <main className="container mx-auto max-w-5xl space-y-6 px-8 py-8"><header><h1 className="flex items-center gap-2 text-2xl font-bold"><BrainCircuit className="h-6 w-6" />Semantic Context</h1><p className="text-muted-foreground mt-1">Teach agents what this data source means.</p></header><Tabs defaultValue="overview"><TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="definitions">Definitions ({data.model.definitions.length})</TabsTrigger><TabsTrigger value="queries">Verified Queries ({queries.data?.queries.length ?? 0})</TabsTrigger></TabsList><TabsContent value="overview" className="space-y-4"><Card><CardHeader><CardTitle className="text-base">Business Context</CardTitle></CardHeader><CardContent className="space-y-3"><Textarea className="min-h-64 font-mono" value={markdown || data.businessContextMd} onChange={event => setMarkdown(event.target.value)} placeholder="Document business rules, vocabulary, and agent instructions in Markdown." /><Button onClick={() => saveMarkdown.mutate()} disabled={saveMarkdown.isPending}>Save context</Button></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileCode2 className="h-4 w-4" />Import Cube YAML</CardTitle></CardHeader><CardContent className="space-y-3"><Textarea className="min-h-40 font-mono" value={yaml} onChange={event => setYaml(event.target.value)} placeholder="cubes:\n  - name: orders" /><Button variant="secondary" onClick={() => importYaml.mutate()} disabled={!yaml.trim() || importYaml.isPending}>Import model</Button><pre className="bg-muted overflow-auto rounded-md p-3 text-xs">{data.modelYaml}</pre></CardContent></Card></TabsContent><TabsContent value="definitions"><DefinitionEditor context={data} connectionId={connectionId} /></TabsContent><TabsContent value="queries" className="space-y-5"><Card><CardHeader><CardTitle className="text-base">Add verified query</CardTitle></CardHeader><CardContent className="space-y-3"><Input value={title} onChange={event => setTitle(event.target.value)} placeholder="Monthly revenue by channel" /><Input value={question} onChange={event => setQuestion(event.target.value)} placeholder="Question this query answers" /><Textarea className="min-h-40 font-mono" value={sql} onChange={event => setSql(event.target.value)} placeholder="SELECT …" /><Button onClick={() => createQuery.mutate()} disabled={!title.trim() || !question.trim() || !sql.trim() || createQuery.isPending}>Add Verified Query</Button></CardContent></Card>{queries.data?.queries.map(item => <Card key={item.id}><CardContent className="flex items-start justify-between gap-4 py-4"><div className="min-w-0"><div className="font-medium">{item.title}</div><p className="text-muted-foreground text-sm">{item.question}</p><pre className="bg-muted mt-2 max-h-28 overflow-auto rounded p-2 text-xs">{item.sql}</pre></div><Button variant="ghost" size="icon-sm" aria-label={`Delete ${item.title}`} onClick={() => deleteQuery.mutate(item.id)}><Trash2 className="h-4 w-4" /></Button></CardContent></Card>)}</TabsContent></Tabs></main>;
}

export function SemanticPage() {
    const params = useParams<{ organization: string; connectionId?: string }>();
    const organization = params.organization;
    const connectionId = params.connectionId;
    const connections = useQuery({ queryKey: ['connections', organization], queryFn: () => executeActionClient<{ connections: ConnectionListItem[] }>('connection.list', {}, { organizationId: organization }) });
    const contexts = useQuery({ queryKey: ['semantic', 'list', organization], queryFn: () => executeActionClient<{ contexts: Context[] }>('semantic.list', {}, { organizationId: organization }) });
    if (connectionId) return <SemanticDetail connectionId={connectionId} />;
    return <main className="container mx-auto max-w-5xl space-y-6 px-8 py-8"><header><h1 className="flex items-center gap-2 text-2xl font-bold"><BrainCircuit className="h-6 w-6" />Semantic Context</h1><p className="text-muted-foreground mt-1">Choose a data source to teach agents its business meaning.</p></header><div className="grid gap-3 md:grid-cols-2">{connections.data?.connections.map(item => { const context = contexts.data?.contexts.find(candidate => candidate.connectionId === item.connection.id); return <Link key={item.connection.id} href={`/${organization}/semantic/${item.connection.id}`}><Card className="hover:bg-accent h-full transition-colors"><CardContent className="py-5"><div className="font-medium">{item.connection.name}</div><p className="text-muted-foreground mt-1 text-sm">{context?.model.definitions.length ?? 0} definitions · {context ? 'Context started' : 'No context yet'}</p></CardContent></Card></Link>; })}</div>{connections.isLoading ? <p className="text-muted-foreground">Loading data sources…</p> : null}</main>;
}
