import type { ReactNode } from 'react';
import CatalogLayout from './catalog-layout';

type CatalogLayoutParams = {
    team: string;
    connectionId: string;
};

export default async function CatalogLayoutPage({
    params: _params,
    children,
}: {
    params: Promise<CatalogLayoutParams>;
    children: ReactNode;
}) {
    return (
        <CatalogLayout>
            {children}
        </CatalogLayout>
    );
}
