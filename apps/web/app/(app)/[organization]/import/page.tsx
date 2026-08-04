import { redirect } from 'next/navigation';

export default async function ImportPage({ params, searchParams }: { params: Promise<{ organization: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const [{ organization }, entry] = await Promise.all([params, searchParams]);
    const connectionId = singleValue(entry.connection);
    if (!connectionId) redirect(`/${encodeURIComponent(organization)}/connections`);
    const query = new URLSearchParams();
    for (const key of ['database', 'schema', 'table'] as const) {
        const value = singleValue(entry[key]);
        if (value) query.set(key, value);
    }
    const destination = `/${encodeURIComponent(organization)}/${encodeURIComponent(connectionId)}/import`;
    redirect(query.size ? `${destination}?${query.toString()}` : destination);
}

function singleValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}
