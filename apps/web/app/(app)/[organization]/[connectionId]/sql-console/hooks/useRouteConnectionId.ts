'use client';

import { useParams } from 'next/navigation';

function resolveParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] : value;
}

export function useRouteConnectionId() {
    const params = useParams<{ connectionId?: string | string[]; connection?: string | string[] }>();
    return resolveParam(params?.connectionId ?? params?.connection) ?? null;
}
