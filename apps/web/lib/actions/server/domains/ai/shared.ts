import { z } from 'zod';

import type { ActionContext } from '@dory/actions';
import type { Locale } from '@dory/i18n/routing';
import type { ColumnInput } from '@dory/shared';
import type { WebActionServices } from '../../types';

export const columnInputSchema = z.object({
    name: z.string().min(1),
    type: z.string().optional(),
    comment: z.string().nullable().optional(),
    defaultValue: z.string().nullable().optional(),
    nullable: z.boolean().optional(),
});

export type AiActionContext = ActionContext<WebActionServices>;

export type SchemaColumnsInput = {
    connectionId?: string | null;
    columns: ColumnInput[];
    database?: string | null;
    table?: string | null;
    model?: string | null;
    catalog?: string | null;
    dbType?: string | null;
};

export function normalizeLocale(locale?: string | null): Locale {
    const normalized = locale?.toLowerCase() ?? '';
    if (normalized.startsWith('zh')) return 'zh';
    if (normalized.startsWith('ja')) return 'ja';
    if (normalized.startsWith('es')) return 'es';
    return 'en';
}
