import { z } from 'zod';

import { chatReferenceSchema, referenceKey, type ChatReference } from './types';

const recentSchema = z.array(z.object({ reference: chatReferenceSchema, usedAt: z.number().finite().nonnegative() })).max(30);
export type RecentReference = z.infer<typeof recentSchema>[number];

export function recentStorageKey(userId: string, organization: string) {
    return `dory:recent-references:v1:${JSON.stringify([userId, organization])}`;
}

export function readRecentReferences(storage: Pick<Storage, 'getItem'>, key: string): RecentReference[] {
    try {
        return recentSchema.parse(JSON.parse(storage.getItem(key) ?? '[]'));
    } catch {
        return [];
    }
}

export function updateRecentReferences(previous: RecentReference[], references: ChatReference[], usedAt: number): RecentReference[] {
    const selected = references.map(reference => ({ reference, usedAt }));
    return [...new Map([...selected, ...previous].map(item => [referenceKey(item.reference), item] as const).reverse()).values()].sort((a, b) => b.usedAt - a.usedAt).slice(0, 30);
}
