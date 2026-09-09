'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';

type ModelOption = { id: string; name: string; dataSources: Array<{ connectionId: string }> };

export function AddDataSourceToSemanticModelDialog({ open, onOpenChange, connectionId }: { open: boolean; onOpenChange: (open: boolean) => void; connectionId: string }) {
    const [semanticModelId, setSemanticModelId] = useState('');
    const [newModelName, setNewModelName] = useState('');
    const models = useQuery({
        queryKey: ['semantic-models-for-source', connectionId],
        enabled: open,
        queryFn: () => executeActionClient<{ models: ModelOption[] }>('semantic.list', {}),
    });
    const available = useMemo(
        () => models.data?.models.filter(model => !model.dataSources.some(source => source.connectionId === connectionId)) ?? [],
        [connectionId, models.data?.models],
    );
    useEffect(() => {
        if (!semanticModelId && available[0]) setSemanticModelId(available[0].id);
    }, [available, semanticModelId]);
    const save = useMutation({
        mutationFn: () =>
            semanticModelId
                ? executeActionClient('semantic.addDataSource', { semanticModelId, connectionId })
                : executeActionClient('semantic.create', { name: newModelName, connectionIds: [connectionId] }),
        onSuccess: () => {
            toast.success('Data source added to semantic model.');
            onOpenChange(false);
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Could not add data source.'),
    });
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add to semantic model</DialogTitle>
                    <DialogDescription>Connect this data source to an existing semantic model or create a new one.</DialogDescription>
                </DialogHeader>
                {available.length ? (
                    <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={semanticModelId} onChange={event => setSemanticModelId(event.target.value)}>
                        {available.map(model => (
                            <option key={model.id} value={model.id}>
                                {model.name}
                            </option>
                        ))}
                    </select>
                ) : (
                    <Input value={newModelName} onChange={event => setNewModelName(event.target.value)} placeholder="New semantic model name" />
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={() => save.mutate()} disabled={(!semanticModelId && !newModelName.trim()) || save.isPending}>
                        {semanticModelId ? 'Add data source' : 'Create model'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
