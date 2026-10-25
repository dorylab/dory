import { z } from 'zod';

export const analysisScopeSchema = z
    .object({
        connectionIds: z.array(z.string().min(1)),
        connectionMode: z.enum(['auto', 'manual']).optional(),
        knowledgeMode: z.enum(['auto', 'manual', 'none']).optional(),
        knowledgeModelId: z.string().min(1).nullable().optional(),
        databasesByConnection: z.record(z.string().min(1), z.string().min(1)).optional(),
    })
    .refine(scope => scope.connectionMode === 'auto' || (scope.connectionIds.length <= 12 && (scope.connectionMode !== 'manual' || scope.connectionIds.length > 0)), {
        message: 'Select between 1 and 12 data sources in manual mode.',
    })
    .refine(scope => Object.keys(scope.databasesByConnection ?? {}).every(id => scope.connectionIds.includes(id)), {
        message: 'Database selections must belong to the selected data sources.',
        path: ['databasesByConnection'],
    });
export const workVisualSchema = z
    .object({
        id: z
            .string()
            .regex(/^[a-zA-Z0-9_-]+$/)
            .max(100),
        type: z.enum(['metric', 'chart', 'table']),
        title: z.string().max(300),
        evidenceId: z.string().min(1),
        chart: z
            .object({ type: z.enum(['bar', 'line']), xKey: z.string(), yKey: z.string() })
            .optional()
            .describe('Required when type is chart. xKey and yKey must be exact columns from the referenced evidence. Omit for table.'),
        metric: z.object({ column: z.string(), rowIndex: z.number().int().min(0).max(499) }).optional(),
    })
    .superRefine((value, ctx) => {
        if (value.type === 'chart' && !value.chart) ctx.addIssue({ code: 'custom', message: 'Chart configuration is required.' });
        if (value.type === 'metric' && !value.metric) ctx.addIssue({ code: 'custom', message: 'Metric must reference an evidence cell.' });
    });
export const workDraftSchema = z
    .object({
        title: z.string().trim().min(1).max(160),
        markdown: z.string().max(200000),
        visuals: z.array(workVisualSchema).max(100),
        status: z.enum(['draft', 'ready']),
    })
    .strict()
    .refine(value => value.status !== 'ready' || value.markdown.trim().length > 0, { message: 'A completed report must have a Markdown body.', path: ['markdown'] });
export const workPatchSchema = z
    .object({
        title: z.string().trim().min(1).max(160).optional(),
        edits: z.array(z.object({ oldText: z.string().max(200000), newText: z.string().max(200000) })).max(100),
        visuals: z
            .array(workVisualSchema)
            .max(100)
            .optional()
            .describe('Upsert only changed visual configurations by ID. Existing visuals are retained; remove their Markdown references to delete them.'),
        status: z.enum(['draft', 'ready']),
    })
    .strict();

export function applyMarkdownEdits(markdown: string, edits: z.infer<typeof workPatchSchema>['edits']): string {
    for (const { oldText, newText } of edits) {
        if (!oldText) {
            if (markdown) throw new Error('An empty anchor is only allowed for an empty document. Read the latest report.');
            markdown = newText;
        } else {
            const index = markdown.indexOf(oldText);
            if (index < 0 || markdown.indexOf(oldText, index + 1) >= 0) throw new Error('Edit anchor must match exactly once. Read the latest report and use a unique anchor.');
            markdown = markdown.slice(0, index) + newText + markdown.slice(index + oldText.length);
        }
    }
    return markdown;
}
