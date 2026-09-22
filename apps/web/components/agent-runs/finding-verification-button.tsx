'use client';

import { useMutation } from '@tanstack/react-query';
import { BadgeCheck, CircleCheck, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';

export function FindingVerificationButton({ findingId, workId, verifiedAt }: { findingId: string; workId: string; verifiedAt: Date | string | null }) {
    const t = useTranslations('AgentRuns');
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
            <Button variant="outline" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                <BadgeCheck className="h-4 w-4 text-primary" />
                {t('Findings.Verified')}
                <Undo2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
        );
    }

    return (
        <Button variant="outline" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <CircleCheck className="h-4 w-4" />
            {t('Findings.Verify')}
        </Button>
    );
}
