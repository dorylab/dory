'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/registry/new-york-v4/ui/button';
import { AddVerifiedQueryDialog } from './add-verified-query-dialog';

export function AgentRunVerifiedQueryButton({ connectionId, sql, workId, title }: { connectionId: string; sql: string; workId: string; title: string }) {
    const t = useTranslations('SemanticContext');
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button variant="outline" onClick={() => setOpen(true)}>
                {t('MarkAsVerified')}
            </Button>
            <AddVerifiedQueryDialog open={open} onOpenChange={setOpen} connectionId={connectionId} sql={sql} sourceType="agent_run" sourceId={workId} initialTitle={title} />
        </>
    );
}
