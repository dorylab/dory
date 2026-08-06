import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { ErrorCodes } from '@dory/shared/errors';

import { ImportServiceError } from '@/lib/server/imports/service';

export function importErrorResponse(error: unknown) {
    if (error instanceof ZodError) {
        return NextResponse.json(
            {
                code: ErrorCodes.VALIDATION_ERROR,
                message: 'Invalid import request',
                importCode: 'IMPORT_VALIDATION_ERROR',
                details: error.issues,
            },
            { status: 400 },
        );
    }
    if (error instanceof ImportServiceError) {
        return NextResponse.json(
            {
                code: error.status === 404 ? ErrorCodes.NOT_FOUND : error.status === 401 ? ErrorCodes.UNAUTHORIZED : ErrorCodes.VALIDATION_ERROR,
                message: error.message,
                importCode: error.code,
                details: error.details,
            },
            { status: error.status },
        );
    }
    throw error;
}
