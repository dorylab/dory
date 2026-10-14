'use client';

import { useMutation } from '@tanstack/react-query';
import { BadgeCheck, CircleCheck, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { executeActionClient } from '@/lib/actions/client';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';

export function FindingVerificationButton({
    findingId,
    workId,
    verifiedAt,
    verifiedByName,
}: {
    findingId: string;
    workId: string;
    verifiedAt: Date | string | null;
    verifiedByName?: string | null;
}) {
    const t = useTranslations('AgentRuns');
    const formatter = useFormatter();
    const organizationId = useOrganizationId();
    const router = useRouter();
    const verified = Boolean(verifiedAt);
    const mutation = useMutation({
        mutationFn: () => executeActionClient(verified ? 'work.finding.unverify' : 'work.finding.verify', { findingId, workId }, { organizationId }),
        onSuccess: () => router.refresh(),
        onError: error => toast.error(error instanceof Error ? error.message : t('Findings.VerificationFailed')),
    });

    if (verified) {
        return (
            <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                    <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                    {t('Findings.Verified')}
                </Badge>
                <span className="text-xs text-muted-foreground">
                    {t('Report.ReviewedBy', { name: verifiedByName ?? t('Report.UnknownReviewer') })} ·{' '}
                    {formatter.dateTime(new Date(verifiedAt!), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <Button variant="ghost" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                    <Undo2 className="h-3.5 w-3.5" />
                    {t('Report.UndoReview')}
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('Report.NotReviewed')}</span>
            <Button variant="outline" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                <CircleCheck className="h-4 w-4" />
                {t('Findings.Verify')}
            </Button>
        </div>
    );
}
