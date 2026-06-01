import { useAtom } from 'jotai';
import { useEffect } from 'react';
import { schemaCacheAtom } from '@/shared/stores/schema.store';
import type { SchemaResponse } from '@/shared/stores/schema.store';
import { executeActionClient } from '@/lib/actions/client';

export function useSchema(connectionId?: string, database?: string) {
    const [schemaCache, setSchemaCache] = useAtom(schemaCacheAtom);
    const cacheKey = connectionId ? `${connectionId}::${database ?? ''}` : '';

    useEffect(() => {
        if (!connectionId || schemaCache[cacheKey]) {
            return;
        }

        executeActionClient<SchemaResponse>('schema.get', { connectionId, database }, { currentConnectionId: connectionId })
            .then(data => {
                setSchemaCache(prev => ({ ...prev, [cacheKey]: data }));
            });
    }, [cacheKey, connectionId, database, schemaCache]);

    const refresh = async () => {
        if (!connectionId) return;
        const data = await executeActionClient<SchemaResponse>('schema.get', { connectionId, database }, { currentConnectionId: connectionId });
        setSchemaCache(prev => ({ ...prev, [cacheKey]: data }));
    };

    return {
        schema: schemaCache[cacheKey],
        refresh,
    };
}
