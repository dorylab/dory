import { cookies } from 'next/headers';
import { getImportConfig } from '@/lib/server/imports/config';
import SQLConsoleClient from './client';

export default async function Page() {
    const layout = (await cookies()).get('react-resizable-panels:layout');

    let defaultLayout;
    if (layout) {
        defaultLayout = JSON.parse(layout.value);
    }

    return <SQLConsoleClient defaultLayout={defaultLayout} maxFileBytes={getImportConfig().maxFileBytes} />;
}
