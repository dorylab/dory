import type { ReactNode } from 'react';
import { getImportConfig } from '@/lib/server/imports/config';
import { ExplorerLayout } from './components/explorer-layout';

export default function ExplorerRouteLayout({ children }: { children: ReactNode }) {
    return <ExplorerLayout maxFileBytes={getImportConfig().maxFileBytes}>{children}</ExplorerLayout>;
}
