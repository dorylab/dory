import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useParams } from 'next/navigation';
import { executeActionClient } from '@/lib/actions/client';
import { currentConnectionAtom } from '@/shared/stores/app.store';

type SchemaOption = {
    value: string;
    label: string;
};

const inflightSchemaRequests = new Map<string, Promise<void>>();

function resolveConnectionParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] : value;
}

export function useSchemas(database?: string, enabled = true) {
    const [schemas, setSchemas] = useState<SchemaOption[]>([]);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const params = useParams<{ connectionId?: string | string[]; connection?: string | string[] }>();
    const routeConnectionId = resolveConnectionParam(params?.connectionId ?? params?.connection);

    useEffect(() => {
        if (!enabled || !database || !routeConnectionId) {
            setSchemas([]);
            return;
        }

        void refresh();
    }, [database, enabled, routeConnectionId]);

    const refresh = async () => {
        if (!enabled || !database) {
            setSchemas([]);
            return;
        }

        const connectionId = routeConnectionId ?? currentConnection?.connection.id;
        if (!connectionId) {
            setSchemas([]);
            return;
        }

        const requestKey = `${connectionId}::${database}`;
        const existingRequest = inflightSchemaRequests.get(requestKey);
        if (existingRequest) {
            await existingRequest;
            return;
        }

        const request = (async () => {
            const payload = await executeActionClient<SchemaOption[]>('schema.listSchemas', { connectionId, database }, { currentConnectionId: connectionId });
            setSchemas(payload ?? []);
        })();

        inflightSchemaRequests.set(requestKey, request);
        try {
            await request;
        } finally {
            inflightSchemaRequests.delete(requestKey);
        }
    };

    return {
        schemas,
        refresh,
    };
}
