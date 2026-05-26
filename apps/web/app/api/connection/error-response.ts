import { NextResponse } from 'next/server';

import { CONNECTION_ERROR_CODES, getConnectionErrorCode } from '@/lib/connection/utils';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@dory/shared/errors';

export function mapConnectionErrorToResponse(error: unknown, messages: { notFound: string; missingHost: string; missingPath?: string; fallback: string }) {
    const code = getConnectionErrorCode(error);
    if (code === CONNECTION_ERROR_CODES.notFound) {
        return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.NOT_FOUND, message: messages.notFound }), { status: 404 });
    }
    if (code === CONNECTION_ERROR_CODES.missingHost) {
        return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: messages.missingHost }), { status: 400 });
    }
    if (code === CONNECTION_ERROR_CODES.missingPath) {
        return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: messages.missingPath ?? messages.missingHost }), { status: 400 });
    }

    return NextResponse.json(ResponseUtil.error({ code: ErrorCodes.ERROR, message: messages.fallback }), { status: 500 });
}
