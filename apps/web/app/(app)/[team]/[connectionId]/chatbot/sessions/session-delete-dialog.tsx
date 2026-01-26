'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
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
import { Loader2 } from 'lucide-react';

type SessionDeleteDialogProps = {
    open: boolean;
    sessionTitle?: string | null;
    loading?: boolean;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
};

export default function SessionDeleteDialog({ open, sessionTitle, loading, onConfirm, onOpenChange }: SessionDeleteDialogProps) {
    const t = useTranslations('Chatbot');
    const handleOpenChange = useCallback(
        (nextOpen: boolean) => {
            if (!loading) {
                onOpenChange(nextOpen);
            }
        },
        [loading, onOpenChange],
    );

    return (
        <AlertDialog open={open} onOpenChange={handleOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t('Sessions.DeleteDialogTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t('Sessions.DeleteDialogDescription', { title: sessionTitle ?? t('Sessions.Untitled') })}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={loading}>{t('Sessions.Cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={loading}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:bg-destructive/90"
                        onClick={event => {
                            event.preventDefault();
                            if (!loading) {
                                onConfirm();
                            }
                        }}
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('Sessions.ConfirmDelete')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
