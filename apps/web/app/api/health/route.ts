import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
const DORY_LOCAL_RUNTIME_PROTOCOL_VERSION = 1;
const DORY_LOCAL_RUNTIME_SECRET_HEADER = 'x-dory-runtime-secret';

export function GET(req: Request) {
    const runtimeSecret = process.env.DORY_LOCAL_RUNTIME_SECRET;
    if (runtimeSecret && req.headers.get(DORY_LOCAL_RUNTIME_SECRET_HEADER) === runtimeSecret) {
        return NextResponse.json({
            ok: true,
            service: 'dory',
            protocolVersion: DORY_LOCAL_RUNTIME_PROTOCOL_VERSION,
            pid: process.pid,
        });
    }

    return NextResponse.json({
        ok: true,
        service: 'dory',
    });
}
