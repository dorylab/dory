import { useAtom } from 'jotai';
import { useEffect } from 'react';
import { schemaCacheAtom } from '@/shared/stores/schema.store';

export function useSchema(connectionId?: string) {
    const [schemaCache, setSchemaCache] = useAtom(schemaCacheAtom);

    useEffect(() => {
        if (!connectionId || schemaCache[connectionId]) {
            return;
        }

        fetch(`/api/connection/${connectionId}/schema`)
            .then(res => res.json())
            .then(data => {
                setSchemaCache(prev => ({ ...prev, [connectionId]: data }));
            });
    }, [connectionId, schemaCache]);

    const refresh = async () => {
        if (!connectionId) return;
        const res = await fetch(`/api/connection/${connectionId}/schema`);
        const data = await res.json();
        setSchemaCache(prev => ({ ...prev, [connectionId]: data }));
    };

    return {
        schema: schemaCache[connectionId as string],
        refresh,
    };
}
