import { z } from 'zod';

export const comparisonEndpointSchema = z.object({
    connectionId: z.string().min(1),
    identityId: z.string().min(1).nullable().optional(),
    database: z.string().min(1),
    schemas: z.array(z.string().min(1)).max(100).optional(),
});

export const comparisonJobOutputSchema = z.object({}).passthrough();
