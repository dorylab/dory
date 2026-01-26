// lib/api/parse-json.ts
import { NextRequest, NextResponse } from 'next/server';
import { z, ZodSchema } from 'zod';
import { ErrorCodes } from '@/lib/errors';
import { ResponseUtil } from '@/lib/result';
import { translateApi, getApiLocale } from '@/app/api/utils/i18n';

export class BadRequestError extends Error {
    public readonly code = ErrorCodes.VALIDATION_ERROR;
    constructor(message: string) {
        super(message);
    }
}

export class ValidationError extends Error {
    public readonly code = ErrorCodes.VALIDATION_ERROR;
    public readonly issues: unknown;
    constructor(message: string, issues?: unknown) {
        super(message);
        this.issues = issues;
    }
}

export async function parseJsonBody<T = any>(req: NextRequest, schema?: ZodSchema<T>): Promise<T> {
    const locale = await getApiLocale();
    let json: unknown;

    try {
        json = await req.json();
    } catch {
        throw new BadRequestError(translateApi('Api.Errors.BodyParseFailed', undefined, locale));
    }

    if (!schema) {
        
        if (!json || typeof json !== 'object') {
            throw new BadRequestError(translateApi('Api.Errors.InvalidParams', undefined, locale));
        }
        return json as T;
    }

    const result = schema.safeParse(json);
    if (!result.success) {
        throw new ValidationError(translateApi('Api.Errors.InvalidParams', undefined, locale), result.error.format());
    }

    return result.data;
}
