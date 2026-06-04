'use client';

import { Loader } from '@/components/ai-elements/loader';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/registry/new-york-v4/ui/alert-dialog';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';

type Props = {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    loading?: boolean;
};

export function DeleteDialog({ open, onConfirm, onCancel, loading }: Props) {
    const t = useTranslations('Connections');

    return (
        <AlertDialog open={open} onOpenChange={v => !v && onCancel()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t('Delete Dialog Title')}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t('Delete Dialog Description')}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel className="cursor-pointer" onClick={onCancel}>
                        {t('Cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction className="cursor-pointer bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40" onClick={onConfirm}>
                        {loading && <Loader />}
                        {!loading && <Trash2 className="h-4 w-4" />}
                        {t('Confirm')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
