'use client';

import { useState } from 'react';

import { Button } from '@/registry/new-york-v4/ui/button';
import { AddVerifiedQueryDialog } from './add-verified-query-dialog';

export function AgentRunVerifiedQueryButton({ connectionId, sql, workId, title }: { connectionId: string; sql: string; workId: string; title: string }) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button variant="outline" onClick={() => setOpen(true)}>
                Mark as Verified
            </Button>
            <AddVerifiedQueryDialog open={open} onOpenChange={setOpen} connectionId={connectionId} sql={sql} sourceType="agent_run" sourceId={workId} initialTitle={title} />
        </>
    );
}
