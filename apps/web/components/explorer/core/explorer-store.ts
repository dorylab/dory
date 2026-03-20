'use client';

import { useAtomValue } from 'jotai';
import { useParams } from 'next/navigation';
import { resolveExplorerDriver } from '@/lib/explorer/capabilities';
import type { ExplorerDriver } from '@/lib/explorer/types';
import { currentConnectionAtom } from '@/shared/stores/app.store';

export function resolveParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] : value;
}

export function safeDecode(value?: string | null) {
    if (!value) return value;

    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

export function splitQualifiedName(value: string): { schema?: string; name: string } {
    const [schema, ...rest] = value.split('.');
    if (!schema || rest.length === 0) {
        return { name: value };
    }

    return {
        schema,
        name: rest.join('.'),
    };
}

export type ExplorerConnectionContext = {
    organizationId?: string;
    connectionId?: string;
    connectionType: ExplorerDriver;
};

export function useExplorerConnectionContext(): ExplorerConnectionContext {
    const currentConnection = useAtomValue(currentConnectionAtom);
    const params = useParams<{
        organization?: string | string[];
        connectionId?: string | string[];
    }>();

    const routeConnectionId = resolveParam(params?.connectionId);
    const connection = currentConnection?.connection;

    return {
        organizationId: resolveParam(params?.organization),
        connectionId: routeConnectionId ?? connection?.id,
        connectionType: resolveExplorerDriver(connection?.type),
    };
}
