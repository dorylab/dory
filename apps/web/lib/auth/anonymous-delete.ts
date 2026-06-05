import { NextResponse } from 'next/server';
import { appendClearAnonymousRecoveryCookieHeader } from './anonymous-recovery';
import { appendClearSessionCookieHeaders } from './session-cookie-cleanup';

export function isLocalAnonymousDeleteRequest(pathname: string) {
    return pathname.endsWith('/delete-anonymous-user');
}

export function buildAnonymousDeleteResponse(req: Request) {
    const response = NextResponse.json({ success: true });

    appendClearSessionCookieHeaders(response.headers, req.headers.get('cookie'));
    appendClearAnonymousRecoveryCookieHeader(response.headers, req.url);

    return response;
}
