// lib/errors.ts
import { translate } from '@/lib/i18n/i18n';
import { Locale, routing } from '@/lib/i18n/routing';

/** Stable error codes for programmatic checks (avoid sentence-like codes) */
export enum ErrorCodes {
    // General
    ERROR = 'ERROR',
    BAD_REQUEST = 'BAD_REQUEST',
    INVALID_PARAMS = 'INVALID_PARAMS',

    // Auth/permissions
    UNAUTHORIZED = 'UNAUTHORIZED',
    FORBIDDEN = 'FORBIDDEN',

    // Resources
    NOT_FOUND = 'NOT_FOUND',
    CONFLICT = 'CONFLICT',

    // Data
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    DATABASE_ERROR = 'DATABASE_ERROR',
    TIMEOUT = 'TIMEOUT',
}

export type ErrorResponse = {
    code: ErrorCodes;
    message: string;
    details?: unknown;
};

const ErrorMessages: Record<ErrorCodes, string> = {
    [ErrorCodes.ERROR]: 'Internal server error',
    [ErrorCodes.BAD_REQUEST]: 'Bad request',
    [ErrorCodes.INVALID_PARAMS]: 'Invalid parameters',

    [ErrorCodes.UNAUTHORIZED]: 'Unauthorized',
    [ErrorCodes.FORBIDDEN]: 'Forbidden',

    [ErrorCodes.NOT_FOUND]: 'Not found',
    [ErrorCodes.CONFLICT]: 'Conflict',

    [ErrorCodes.VALIDATION_ERROR]: 'Validation failed',
    [ErrorCodes.DATABASE_ERROR]: 'Database error',
    [ErrorCodes.TIMEOUT]: 'Request timeout',
};

export class ErrorRegistry {
    static getErrorMessage(code: ErrorCodes, options?: { locale?: Locale }): string {
        const locale = options?.locale ?? routing.defaultLocale;
        try {
            return translate(locale, `ErrorCodes.${code}`, { code });
        } catch {
            return ErrorMessages[code] ?? translate(locale, 'ErrorCodes.Unknown', { code });
        }
    }

    static getErrorResponse(code: ErrorCodes, message?: string, details?: unknown, options?: { locale?: Locale }): ErrorResponse {
        return {
            code,
            message: message ?? ErrorRegistry.getErrorMessage(code, options),
            ...(details !== undefined ? { details } : {}),
        };
    }
}
