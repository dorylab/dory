'use client';
import { useRouter, useParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/registry/new-york-v4/ui/button';
import { authFetch } from '@/lib/client/auth-fetch';
export function GenerateWorkFromRun({ runId }: { runId: string }) {
    const t = useTranslations('WorkDocuments');
    const { organization } = useParams<{ organization: string }>();
    const router = useRouter();
    const mutation = useMutation({
        mutationFn: async () => {
            const response = await authFetch('/api/work-documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error ?? 'Unable to generate Work.');
            return result as { document: { id: string } };
        },
        onSuccess: result => router.push(`/${organization}/works/${result.document.id}`),
        onError: error => toast.error(error.message),
    });
    return (
        <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? t('Loading') : t('CreateWork')}
        </Button>
    );
}
