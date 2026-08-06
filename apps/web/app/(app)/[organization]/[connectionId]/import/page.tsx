import { redirect } from 'next/navigation';

import { DataImportList } from '../../import/data-import-list.client';

export default async function ImportPage({
    params,
    searchParams,
}: {
    params: Promise<{ organization: string; connectionId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const [{ organization, connectionId }, entry] = await Promise.all([params, searchParams]);
    const targetEntries = (['database', 'schema', 'table'] as const)
        .map(key => [key, singleValue(entry[key])] as const)
        .filter((entry): entry is readonly ['database' | 'schema' | 'table', string] => Boolean(entry[1]));
    if (targetEntries.length) {
        const query = new URLSearchParams();
        for (const [key, value] of targetEntries) query.set(key, value);
        redirect(`/${encodeURIComponent(organization)}/${encodeURIComponent(connectionId)}/import/new?${query.toString()}`);
    }

    return <DataImportList organization={organization} connectionId={connectionId} />;
}

function singleValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}
