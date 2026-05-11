'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { isDesktopRuntime } from '@dory/shared/runtime';

export function SessionRecoverySync() {
    const router = useRouter();
    const syncInFlightRef = React.useRef(false);

    React.useEffect(() => {
        if (!isDesktopRuntime()) {
            return;
        }

        let disposed = false;

        const syncSession = async () => {
            if (disposed || syncInFlightRef.current || !navigator.onLine) {
                return;
            }

            syncInFlightRef.current = true;
            try {
                const response = await fetch('/api/auth/get-session', {
                    credentials: 'include',
                    cache: 'no-store',
                });

                if (!disposed && response.ok) {
                    router.refresh();
                }
            } catch {
                // Ignore transient reconnect failures.
            } finally {
                syncInFlightRef.current = false;
            }
        };

        void syncSession();

        const handleOnline = () => {
            void syncSession();
        };

        window.addEventListener('online', handleOnline);
        return () => {
            disposed = true;
            window.removeEventListener('online', handleOnline);
        };
    }, [router]);

    return null;
}
