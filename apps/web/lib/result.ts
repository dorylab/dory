import { ResponseObject, ResponseObjectCode } from '@/types';
import { ErrorCodes } from './errors';
import { ZodError } from 'zod';

export const ResponseUtil = {
    success<T = unknown>(data?: T): ResponseObject<T> {
        return {
            code: 0,
            message: 'success',
            ...(data !== undefined ? { data } : null),
        };
    },

    error(errorRes: { code: ResponseObjectCode; message: string, error?: Error | ZodError, [x: string]: any }): ResponseObject<null> {
        const { code = ErrorCodes.ERROR, message = 'error', error, ...rest } = errorRes;
        return {
            code,
            message,
            error,
            ...rest
        };
    },
};

export const isSuccess = (res: ResponseObject): boolean => {
    return res.code === 0;
}
