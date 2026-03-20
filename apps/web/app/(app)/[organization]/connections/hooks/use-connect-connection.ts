'use client';

import { useMutation } from '@tanstack/react-query';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useSetAtom } from 'jotai';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import posthog from 'posthog-js';

import { connectConnection } from '../api';
import { connectionLoadingAtom } from '../states';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import type { ResponseObject } from '@/types';
import type { ConnectionListItem } from '@/types/connections';

type ConnectParams = {
    payload: ConnectionListItem;
    navigateToConsole?: boolean;
    identityId?: string | null;
    setCurrentImmediately?: boolean;
};

function makeLoadingKey(connectionId: string, identityId?: string | null) {
    return identityId ? `${connectionId}:${identityId}` : connectionId;
}

function resolveTeamId(paramsTeam: unknown, pathname: string | null): string | null {
    const paramValue = Array.isArray(paramsTeam) ? paramsTeam[0] : paramsTeam;
    if (typeof paramValue === 'string' && paramValue.length > 0) {
        return paramValue;
    }

    if (!pathname) return null;

    const segments = pathname.split('/').filter(Boolean);
    return segments[0] ?? null;
}

export function useConnectConnection() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useParams();
    const t = useTranslations('Connections');
    const organizationId = resolveTeamId(params?.organization, pathname);

    const setConnectLoadings = useSetAtom(connectionLoadingAtom);
    const setCurrentConnection = useSetAtom(currentConnectionAtom);

    return useMutation<ResponseObject<unknown>, Error, ConnectParams>({
        mutationFn: async ({ payload, identityId }) => {
            if (!payload?.connection?.id) throw new Error(t('Missing connection id'));

            
            const requestPayload = identityId ? { ...payload, identityId } : payload;
            return connectConnection(requestPayload as ConnectionListItem & { identityId?: string | null });
        },
        onMutate: ({ payload, identityId, setCurrentImmediately }) => {
            if (!payload?.connection?.id) return;
            if (setCurrentImmediately ?? true) {
                setCurrentConnection(payload);
            }
            setConnectLoadings((prev: Record<string, boolean> = {}) => ({
                ...prev,
                [makeLoadingKey(payload.connection.id, identityId)]: true,
            }));
        },
        onSuccess: (_res, { payload, navigateToConsole, setCurrentImmediately }) => {
            if (setCurrentImmediately === false) {
                setCurrentConnection(payload);
            }
            posthog.capture('connection_opened', {
                connection_type: payload.connection.type,
                connection_id: payload.connection.id,
            });
            if (navigateToConsole && organizationId) {
                router.push(`/${organizationId}/${payload.connection.id}/sql-console`);
            }
        },
        onError: error => {
            posthog.capture('connection_open_failed', {
                error: (error as Error)?.message,
            });
            toast.error((error as Error)?.message || t('Connection failed'));
        },
        onSettled: (_res, _error, { payload, identityId }) => {
            if (!payload?.connection?.id) return;
            setConnectLoadings((prev: Record<string, boolean> = {}) => {
                const next = { ...prev };
                delete next[makeLoadingKey(payload.connection.id, identityId)];
                return next;
            });
        },
    });
}
