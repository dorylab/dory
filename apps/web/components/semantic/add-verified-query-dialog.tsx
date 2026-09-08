'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';

export function AddVerifiedQueryDialog({ open, onOpenChange, connectionId, sql, sourceType, sourceId, initialTitle = '' }: { open: boolean; onOpenChange: (open: boolean) => void; connectionId: string | null | undefined; sql: string | null | undefined; sourceType: string; sourceId?: string | null; initialTitle?: string }) {
    const [title, setTitle] = useState(initialTitle);
    const [question, setQuestion] = useState('');
    useEffect(() => { if (open) { setTitle(initialTitle); setQuestion(''); } }, [open, initialTitle]);
    const save = useMutation({
        mutationFn: () => executeActionClient('semantic.createVerifiedQuery', { connectionId, title, question, sql, sourceType, sourceId }, { currentConnectionId: connectionId ?? null }),
        onSuccess: () => { toast.success('Added to Semantic Context.'); onOpenChange(false); },
        onError: error => toast.error(error instanceof Error ? error.message : 'Could not add verified query.'),
    });
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Add Verified Query</DialogTitle><DialogDescription>Save this validated SQL as reusable business knowledge for agents.</DialogDescription></DialogHeader><div className="space-y-3"><Input value={title} onChange={event => setTitle(event.target.value)} placeholder="Monthly revenue by channel" /><Textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder="What question does this query answer?" /><Textarea className="min-h-40 font-mono" value={sql ?? ''} readOnly /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => save.mutate()} disabled={!connectionId || !sql?.trim() || !title.trim() || !question.trim() || save.isPending}>Add Verified Query</Button></DialogFooter></DialogContent></Dialog>;
}
