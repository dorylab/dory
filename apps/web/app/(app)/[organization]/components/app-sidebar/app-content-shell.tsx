'use client';

import { Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ReactNode, useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai';

import { databasesAtom, tablesAtom } from '@/shared/stores/app.store';
import { connectionLoadingMessageAtom, connectionSwitchingAtom } from '../../connections/states';

export function AppContentShell({ children }: { children: ReactNode }) {
    const params = useParams<{ connectionId?: string | string[]; connection?: string | string[] }>();
    const t = useTranslations('AppSidebar');
    const routeConnectionParam = params?.connectionId ?? params?.connection;
    const routeConnectionId = Array.isArray(routeConnectionParam) ? routeConnectionParam[0] : routeConnectionParam;
    const [connectionSwitching, setConnectionSwitching] = useAtom(connectionSwitchingAtom);
    const loadingMessage = useAtomValue(connectionLoadingMessageAtom);
    const databasesState = useAtomValue(databasesAtom);
    const tablesState = useAtomValue(tablesAtom);

    const targetConnectionId = connectionSwitching?.connectionId ?? null;
    const isTargetRoute = Boolean(targetConnectionId && routeConnectionId === targetConnectionId);
    const databasesReady = Boolean(targetConnectionId && databasesState.connectionId === targetConnectionId && !databasesState.loading);
    const tablesReady = Boolean(targetConnectionId && !tablesState.loading && tablesState.connectionId === targetConnectionId);
    const transitionReady = Boolean(isTargetRoute && databasesReady && tablesReady);

    useEffect(() => {
        if (!connectionSwitching) return;

        if (transitionReady) {
            const readyTimer = window.setTimeout(() => {
                setConnectionSwitching(null);
            }, 200);

            return () => window.clearTimeout(readyTimer);
        }

        const fallbackTimer = window.setTimeout(() => {
            setConnectionSwitching(null);
        }, 5000);

        return () => window.clearTimeout(fallbackTimer);
    }, [connectionSwitching, setConnectionSwitching, transitionReady]);

    return (
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
            {children}
            {connectionSwitching ? (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/95 text-foreground">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <div className="text-sm font-medium">{t('SQLConsole')}</div>
                    {loadingMessage ? <div className="text-xs text-muted-foreground">{loadingMessage}</div> : null}
                </div>
            ) : null}
        </div>
    );
}
