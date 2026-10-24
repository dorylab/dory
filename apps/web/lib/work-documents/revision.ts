import { z } from 'zod';

export function parseWorkRevision(value: string | null): number | undefined {
    if (value === null) return undefined;
    return z
        .string()
        .regex(/^[1-9]\d*$/)
        .transform(Number)
        .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER))
        .parse(value);
}
