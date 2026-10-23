'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { WorkDocumentSummary } from '@dory/shared/types/work-document';
import { Button } from '@/registry/new-york-v4/ui/button';
import { workRequest } from '@/lib/work-documents/client';
export function ChatWorkLinks({ chatId, busy }: { chatId: string; busy: boolean }) {
    const { organization, connectionId } = useParams<{ organization: string; connectionId?: string }>();
    const t = useTranslations('WorkDocuments');
    const query = useQuery({
        queryKey: ['work-documents', organization, chatId, busy],
        queryFn: () => workRequest<{ documents: WorkDocumentSummary[] }>(`/api/work-documents?chatId=${encodeURIComponent(chatId)}`),
        refetchInterval: busy ? 2000 : false,
    });
    return (
        <div className="flex flex-wrap gap-2 px-2">
            {query.data?.documents.map(document => (
                <Button key={document.id} variant="outline" size="sm" asChild>
                    <Link href={`/${organization}/data-agent?chat=${chatId}&document=${document.id}`}>Work · {document.title}</Link>
                </Button>
            ))}
            <Button variant="ghost" size="sm" disabled={busy} asChild>
                <Link href={`/${organization}/data-agent?chat=${chatId}${connectionId ? `&sources=${connectionId}` : ''}`}>{t('CreateWork')}</Link>
            </Button>
        </div>
    );
}
