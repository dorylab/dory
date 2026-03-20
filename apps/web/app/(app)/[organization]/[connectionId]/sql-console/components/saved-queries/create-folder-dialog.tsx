'use client';

import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Button } from '@/registry/new-york-v4/ui/button';

type CreateFolderDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (name: string) => Promise<void>;
    t: (key: string) => string;
};

export function CreateFolderDialog({ open, onOpenChange, onSubmit, t }: CreateFolderDialogProps) {
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSubmit = async () => {
        const trimmed = name.trim();
        if (!trimmed || saving) return;
        setSaving(true);
        try {
            await onSubmit(trimmed);
            setName('');
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={open => { onOpenChange(open); if (!open) setName(''); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('SavedQueries.Folders.CreateTitle')}</DialogTitle>
                </DialogHeader>
                <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={t('SavedQueries.Folders.FolderNamePlaceholder')}
                    autoFocus
                    disabled={saving}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleSubmit();
                        }
                    }}
                />
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        {t('SavedQueries.Cancel')}
                    </Button>
                    <Button onClick={handleSubmit} disabled={saving || !name.trim()}>
                        {saving ? t('SavedQueries.Saving') : t('SavedQueries.Save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
