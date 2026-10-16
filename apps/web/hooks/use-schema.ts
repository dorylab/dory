import { useQuery } from '@tanstack/react-query';
import type { SchemaResponse } from '@/shared/stores/schema.store';
import { executeActionClient } from '@/lib/actions/client';

export function useSchema(connectionId?: string, database?: string) {
    const query = useQuery({
        queryKey: ['schema', 'map', connectionId, database ?? ''],
        enabled: Boolean(connectionId),
        queryFn: () => {
            if (!connectionId) throw new Error('Missing connectionId');
            return executeActionClient<SchemaResponse>('schema.get', { connectionId, database }, { currentConnectionId: connectionId });
        },
        staleTime: 5 * 60_000,
        retry: false,
    });

    const refresh = async () => {
        if (!connectionId) return;
        await query.refetch();
    };

    return {
        schema: query.data,
        error: query.error,
        isLoading: query.isLoading,
        refresh,
    };
}
