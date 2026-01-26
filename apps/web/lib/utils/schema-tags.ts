import { cleanJson } from '@/lib/ai/core/clean-json';

export function uniqueTags(tags: string[]) {
    return Array.from(new Set(tags.filter(Boolean)));
}
