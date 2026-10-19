import { z } from 'zod';

export const savedQueryMetadataSchema = z.object({
    description: z.string().trim().min(1).max(4000),
    useWhen: z.string().trim().min(1).max(4000),
});

function stripJsonFence(value: string) {
    return value
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
}

export function parseSavedQueryMetadata(value: string) {
    return savedQueryMetadataSchema.parse(JSON.parse(stripJsonFence(value)));
}
