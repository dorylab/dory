import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getSessionFromRequest } from '@/lib/auth/session';
import { isDesktopRuntime } from '@dory/shared/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    if (!isDesktopRuntime()) {
        return NextResponse.json({ ok: false, error: 'desktop_runtime_required' }, { status: 404 });
    }

    const session = await getSessionFromRequest(req);
    return NextResponse.json({
        ok: Boolean(session?.session && session?.user),
        session: session?.session ?? null,
        user: session?.user ?? null,
    });
}
