'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Database, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Label } from '@/registry/new-york-v4/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { useConnections } from '../../connections/hooks/use-connections';
import type { Work } from '../types';

type NewWorkPageClientProps = {
    organization: string;
};

const suggestions = ['Analyze AI feature health for the last 24 hours.', 'Find why query failures increased this week.', 'Compare usage trend between new and returning users.'];

export function NewWorkPageClient({ organization }: NewWorkPageClientProps) {
    const router = useRouter();
    const connectionsQuery = useConnections();
    const [connectionId, setConnectionId] = useState('');
    const [goal, setGoal] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const selectedConnection = useMemo(() => connectionsQuery.data?.find(item => item.connection.id === connectionId) ?? null, [connectionId, connectionsQuery.data]);

    const canCreate = Boolean(connectionId && goal.trim() && !isCreating);

    const handleCreate = async () => {
        if (!canCreate) return;
        setIsCreating(true);
        try {
            const work = await executeActionClient<Work>('work.create', {
                connectionId,
                goal: goal.trim(),
            });
            router.push(`/${organization}/work/${work.id}`);
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : 'Failed to create Work');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="bg-n8 h-screen overflow-auto">
            <div className="container mx-auto mt-10 max-w-5xl p-12 lg:p-12 xl:p-8 2xl:p-4">
                <Button variant="ghost" className="mb-5 w-fit" onClick={() => router.push(`/${organization}/work`)}>
                    <ArrowLeft />
                    Work
                </Button>

                <div className="mb-8">
                    <h1 className="text-2xl font-semibold tracking-tight">New Work</h1>
                    <p className="mt-2 text-sm text-muted-foreground">Choose a data source manually, then define the goal humans and Agent will work from.</p>
                </div>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <section className="rounded-lg border bg-card p-6 text-card-foreground">
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label>Data Source</Label>
                                <Select value={connectionId} onValueChange={setConnectionId} disabled={connectionsQuery.isLoading || isCreating}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder={connectionsQuery.isLoading ? 'Loading data sources...' : 'Select a data source'} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(connectionsQuery.data ?? []).map(item => (
                                            <SelectItem key={item.connection.id} value={item.connection.id}>
                                                {item.connection.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="work-goal">Goal</Label>
                                <Textarea
                                    id="work-goal"
                                    value={goal}
                                    onChange={event => setGoal(event.target.value)}
                                    placeholder="What do you want to work on?"
                                    className="min-h-36 resize-none text-sm"
                                    disabled={isCreating}
                                />
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {suggestions.map(item => (
                                    <Button key={item} type="button" variant="secondary" size="sm" onClick={() => setGoal(item)} disabled={isCreating}>
                                        {item}
                                    </Button>
                                ))}
                            </div>

                            <div className="flex justify-end">
                                <Button onClick={handleCreate} disabled={!canCreate}>
                                    {isCreating && <Loader2 className="animate-spin" />}
                                    Create Work
                                </Button>
                            </div>
                        </div>
                    </section>

                    <aside className="rounded-lg border bg-card p-5 text-card-foreground">
                        <h2 className="text-sm font-semibold">Context</h2>
                        <div className="mt-5 space-y-5 text-sm">
                            <div>
                                <p className="text-xs font-medium uppercase text-muted-foreground">Connection</p>
                                <div className="mt-2 flex items-center gap-2">
                                    <Database className="size-4 text-muted-foreground" />
                                    <span>{selectedConnection?.connection.name ?? 'Not selected'}</span>
                                </div>
                            </div>
                            <div>
                                <p className="text-xs font-medium uppercase text-muted-foreground">Status</p>
                                <p className="mt-2">Draft after creation</p>
                            </div>
                            <div>
                                <p className="text-xs font-medium uppercase text-muted-foreground">Available actions</p>
                                <ul className="mt-2 space-y-1 text-muted-foreground">
                                    <li>Inspect schema</li>
                                    <li>Create investigation</li>
                                    <li>Open SQL workspace</li>
                                    <li>Update conclusion</li>
                                </ul>
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}
