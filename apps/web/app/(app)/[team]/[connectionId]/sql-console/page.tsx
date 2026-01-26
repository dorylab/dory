import { cookies } from 'next/headers';
import SQLConsoleClient from './client';

export default async function Page() {
    const layout = (await cookies()).get('react-resizable-panels:layout');

    let defaultLayout;
    if (layout) {
        defaultLayout = JSON.parse(layout.value);
    }

    return <SQLConsoleClient defaultLayout={defaultLayout} />;
}
