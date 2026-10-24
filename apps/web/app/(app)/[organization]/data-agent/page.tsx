import { redirect } from 'next/navigation';

export default async function Page({ params, searchParams }: { params: Promise<{ organization: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const [{ organization }, query] = await Promise.all([params, searchParams]);
    const forwarded = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
            forwarded.append(key, item);
        }
    }
    const search = forwarded.toString();
    redirect(`/${encodeURIComponent(organization)}/work${search ? `?${search}` : ''}`);
}
