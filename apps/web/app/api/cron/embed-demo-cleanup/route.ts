import { NextRequest, NextResponse } from 'next/server';

import { cleanupExpiredHackerNewsEmbedDemos } from '@/lib/server/embed-demo/cleanup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const result = await cleanupExpiredHackerNewsEmbedDemos();
    return NextResponse.json(result, { status: result.failures.length > 0 ? 207 : 200 });
}
