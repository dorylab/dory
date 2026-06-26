import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/registry/new-york-v4/ui/badge';
import { createAgentRunTextFormatter } from '@/lib/agent-runs/i18n';
import { getAgentRunStatusVariant } from '@/lib/agent-runs/summary';

export function AgentRunStatusBadge({ status }: { status: string | null | undefined }) {
    const t = useTranslations('AgentRuns');
    const formatter = createAgentRunTextFormatter(t);
    const isLoading = status === 'active';

    return (
        <Badge variant={getAgentRunStatusVariant(status)} className={isLoading ? 'gap-1.5' : undefined}>
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
            <span>{formatter.statusLabel(status)}</span>
        </Badge>
    );
}
