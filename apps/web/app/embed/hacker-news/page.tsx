import type { Metadata } from 'next';

import QueryClientWrapper from '@/components/@dory/ui/query-client-wrapper/query-client-wrapper';
import { normalizeEmbedDemoLocale } from '@/lib/server/embed-demo/config';
import { HackerNewsEmbedBootstrap } from './page.client';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Hacker News live demo · Dory', robots: { index: false, follow: false } };

export default async function HackerNewsEmbedPage({ searchParams }: { searchParams: Promise<{ locale?: string }> }) {
    const locale = normalizeEmbedDemoLocale((await searchParams).locale);
    return (
        <QueryClientWrapper>
            <HackerNewsEmbedBootstrap locale={locale} />
        </QueryClientWrapper>
    );
}
