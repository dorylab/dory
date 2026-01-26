// app/api/auth/[...all]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getAuth } from '@/lib/auth';

export async function GET(req: Request) {
    const auth = await getAuth();
    return auth.handler(req);
}

export async function POST(req: Request) {
    const auth = await getAuth();
    return auth.handler(req);
}
