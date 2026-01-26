// lib/api/handle-error.ts
import { NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { BadRequestError, ValidationError } from './parse-json';
import { ConnectionDuplicateNameError, ConnectionIdentityValidationError, ConnectionNotFoundError } from '@/lib/database/postgres/impl/connections';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

export async function handleApiError(err: any): Promise<NextResponse> {
    const locale = await getApiLocale();
    
    if (err instanceof BadRequestError || err instanceof ValidationError) {
        return NextResponse.json(
            ResponseUtil.error({
                code: err.code,
                message: err.message,
                error: err instanceof ValidationError ? err : undefined,
            }),
            { status: 400 },
        );
    }

    
    if (err instanceof ConnectionNotFoundError) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.NOT_FOUND,
                message: err.message,
            }),
            { status: 404 },
        );
    }

    if (err instanceof ConnectionDuplicateNameError) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: err.message,
            }),
            { status: 409 },
        );
    }

    if (err instanceof ConnectionIdentityValidationError) {
        return NextResponse.json(
            ResponseUtil.error({
                code: ErrorCodes.VALIDATION_ERROR,
                message: err.message,
            }),
            { status: 400 },
        );
    }

    
    return NextResponse.json(
        ResponseUtil.error({
            code: ErrorCodes.DATABASE_ERROR,
            message: err?.message ?? translateApi('Api.Errors.InternalError', undefined, locale),
            error: err,
        }),
        { status: 500 },
    );
}
