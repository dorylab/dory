'use client';

import { useState } from 'react';
import type { ChartOverride, ChartPresentation, ChartResultPart } from '@dory/shared/types/chat-chart';
import { effectiveChart, getChartOverride } from '@dory/shared/utils/chat-chart';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { executeActionClient } from '@/lib/actions/client';
import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';

import { ChartResultCard } from './index';

export function ChatChart({
    result,
    metadata,
    toolCallId,
    messageId,
    sessionId,
    editable,
    onUpdated,
}: {
    result: ChartResultPart;
    metadata: unknown;
    toolCallId: string;
    messageId: string;
    sessionId?: string | null;
    editable: boolean;
    onUpdated?: (toolCallId: string, entry: ChartOverride) => void;
}) {
    const organizationId = useOrganizationId();
    const queryClient = useQueryClient();
    const [saved, setSaved] = useState<ChartOverride | null>(null);
    const original = getChartOverride(metadata, toolCallId);
    const current = saved && saved.version > original.version ? saved : original;
    const resolved = effectiveChart(result, { chartOverrides: { [toolCallId]: current } }, toolCallId);
    const mutation = useMutation({
        mutationFn: (presentation: ChartPresentation | null) =>
            executeActionClient<ChartOverride>('chat.chart.update', { sessionId, messageId, toolCallId, expectedVersion: current.version, presentation }, { organizationId }),
        onSuccess: entry => {
            setSaved(entry);
            onUpdated?.(toolCallId, entry);
            void queryClient.invalidateQueries({ predicate: query => query.queryKey.some(key => key === sessionId || key === 'agent-works' || key === 'data-agent') });
        },
    });
    return (
        <ChartResultCard
            result={resolved}
            organizationId={organizationId}
            onSave={
                editable && sessionId
                    ? async presentation => {
                          await mutation.mutateAsync(presentation);
                      }
                    : undefined
            }
        />
    );
}
