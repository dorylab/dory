'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/registry/new-york-v4/ui/button';

export function ReportVersionRemoved({ organization, documentId }: { organization: string; documentId: string }) {
    const t = useTranslations('WorkDocuments.VersionHistory');
    return (
        <div role="alert" className="space-y-3 p-4">
            <p>{t('Removed')}</p>
            <Button asChild variant="outline">
                <Link href={`/${encodeURIComponent(organization)}/reports/${encodeURIComponent(documentId)}`}>{t('OpenCurrent')}</Link>
            </Button>
        </div>
    );
}
