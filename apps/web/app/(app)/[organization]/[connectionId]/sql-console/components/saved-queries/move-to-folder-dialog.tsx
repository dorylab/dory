'use client';

import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/registry/new-york-v4/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/registry/new-york-v4/ui/select';
import { Button } from '@/registry/new-york-v4/ui/button';
import type { FolderData } from './folder-item';

const ROOT_VALUE = '__root__';

type MoveToFolderDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    folders: FolderData[];
    currentFolderId: string | null;
    onSubmit: (folderId: string | null) => Promise<void>;
    t: (key: string) => string;
};

export function MoveToFolderDialog({ open, onOpenChange, folders, currentFolderId, onSubmit, t }: MoveToFolderDialogProps) {
    const [selected, setSelected] = useState<string>(currentFolderId ?? ROOT_VALUE);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async () => {
        if (saving) return;
        const folderId = selected === ROOT_VALUE ? null : selected;
        if (folderId === currentFolderId) {
            onOpenChange(false);
            return;
        }
        setSaving(true);
        try {
            await onSubmit(folderId);
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={open => { onOpenChange(open); if (!open) setSelected(currentFolderId ?? ROOT_VALUE); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('SavedQueries.Folders.MoveToFolder')}</DialogTitle>
                </DialogHeader>
                <Select value={selected} onValueChange={setSelected}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ROOT_VALUE}>{t('SavedQueries.Folders.MoveToRoot')}</SelectItem>
                        {folders.map(f => (
                            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        {t('SavedQueries.Cancel')}
                    </Button>
                    <Button onClick={handleSubmit} disabled={saving}>
                        {saving ? t('SavedQueries.Saving') : t('SavedQueries.Save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
