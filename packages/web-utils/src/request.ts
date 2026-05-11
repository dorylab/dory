import { NextRequest } from 'next/server';

export function getConnectionIdFromRequest(req: NextRequest) {
    return req.headers.get('x-connection-id') ?? req.nextUrl.searchParams.get('connectionId');
}
