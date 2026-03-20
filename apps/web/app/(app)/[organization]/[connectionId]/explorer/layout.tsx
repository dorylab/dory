import type { ReactNode } from 'react';
import { ExplorerLayout } from './components/explorer-layout';

export default function ExplorerRouteLayout({ children }: { children: ReactNode }) {
    return <ExplorerLayout>{children}</ExplorerLayout>;
}
