import { z } from 'zod';
import type { ActionContext } from '@dory/actions';
import type { WebActionServices } from '../../types';
import { listDatabasesOperation, listTablesOperation } from '@/lib/ai/tools/dory-tool-operations';
import { generateText } from '@/lib/ai/gateway';
import { resolveAiLanguageModel } from '@/lib/ai/execution/resolver';
import { compileSystemPrompt } from '@/lib/ai/model/compile-system';
import { getPromptLanguageLine } from '@/lib/ai/prompts/tasks/language';
import { defineWebAction } from '../../define-web-action';
import { actionOperationContext, actorAuditSource } from '../../operation-context';
import { readConnection } from '../../policies';
import { workTypeSchema } from './schemas';

const MAX_DATABASES_TO_SCAN = 3;
const MAX_TABLES_TO_INCLUDE = 30;
const MAX_SUGGESTIONS = 3;

type WorkGoalSuggestionInput = {
    connectionId: string;
    workType: z.infer<typeof workTypeSchema>;
};

type SchemaTableSummary = {
    database: string;
    catalog?: string;
    schema?: string;
    table: string;
    type?: string;
};

const workGoalSuggestionsOutputSchema = z.object({
    suggestions: z.array(z.string()).max(MAX_SUGGESTIONS),
});

function optionName(item: unknown) {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return '';
    const record = item as Record<string, unknown>;
    return [record.name, record.value, record.label, record.database]
        .find(value => typeof value === 'string' && value.trim())
        ?.toString()
        .trim() ?? '';
}

function tableName(item: unknown) {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return '';
    const record = item as Record<string, unknown>;
    return [record.name, record.value, record.label, record.table, record.tableName]
        .find(value => typeof value === 'string' && value.trim())
        ?.toString()
        .trim() ?? '';
}

function stringField(item: unknown, keys: string[]) {
    if (!item || typeof item !== 'object') return undefined;
    const record = item as Record<string, unknown>;
    return keys
        .map(key => record[key])
        .find((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        ?.trim();
}

async function inspectSchema(ctx: ActionContext<WebActionServices>, connectionId: string): Promise<SchemaTableSummary[]> {
    const operationContext = actionOperationContext(ctx, actorAuditSource(ctx, 'dory_schema_metadata'));
    const databasesResponse = (await listDatabasesOperation(operationContext, { connectionId })) as { databases?: unknown[] };
    const databaseNames = Array.from(new Set((databasesResponse.databases ?? []).map(optionName).filter(Boolean))).slice(0, MAX_DATABASES_TO_SCAN);
    const summaries: SchemaTableSummary[] = [];

    for (const database of databaseNames) {
        const tablesResponse = (await listTablesOperation(operationContext, { connectionId, database }).catch(() => ({ tables: [] }))) as { tables?: unknown[] };
        for (const table of tablesResponse.tables ?? []) {
            const name = tableName(table);
            if (!name) continue;
            summaries.push({
                database,
                catalog: stringField(table, ['catalog', 'catalogName']),
                schema: stringField(table, ['schema', 'schemaName', 'tableSchema']),
                table: name,
                type: stringField(table, ['type', 'tableType']),
            });
            if (summaries.length >= MAX_TABLES_TO_INCLUDE) return summaries;
        }
    }

    return summaries;
}

function formatSchemaContext(tables: SchemaTableSummary[]) {
    if (!tables.length) return 'No tables were visible in the selected data source.';
    return tables
        .map(item => {
            const namespace = [item.database, item.catalog, item.schema].filter(Boolean).join('.');
            const qualifiedName = namespace ? `${namespace}.${item.table}` : item.table;
            return `- ${qualifiedName}${item.type ? ` (${item.type})` : ''}`;
        })
        .join('\n');
}

function parseSuggestions(text: string) {
    const normalized = text.trim();
    const candidates: unknown[] = [];

    try {
        const parsed = JSON.parse(normalized) as unknown;
        if (Array.isArray(parsed)) candidates.push(...parsed);
        if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { suggestions?: unknown[] }).suggestions)) {
            candidates.push(...((parsed as { suggestions: unknown[] }).suggestions ?? []));
        }
    } catch {
        candidates.push(...normalized.split('\n'));
    }

    return Array.from(
        new Set(
            candidates
                .map(item => (typeof item === 'string' ? item : ''))
                .map(item =>
                    item
                        .replace(/^\s*(?:[-*]|\d+[.)])\s*/g, '')
                        .replace(/^["'`]+|["'`]+$/g, '')
                        .replace(/\s+/g, ' ')
                        .trim(),
                )
                .filter(item => item.length >= 12 && item.length <= 140),
        ),
    ).slice(0, MAX_SUGGESTIONS);
}

function buildSuggestionPrompt(input: WorkGoalSuggestionInput & { locale?: string | null; tables: SchemaTableSummary[] }) {
    return [
        'Suggest concrete Dory Work goals for the selected data source.',
        getPromptLanguageLine(input.locale),
        '',
        'Use the actual schema structure below. Do not use generic product, AI feature, query failure, or commerce examples unless those concepts are visible in the schema.',
        'Return JSON only: {"suggestions":["...", "...", "..."]}.',
        'Requirements:',
        `- Return exactly ${MAX_SUGGESTIONS} suggestions when the schema has enough signal; otherwise return fewer.`,
        '- Each suggestion should be a user-ready investigation or analysis goal.',
        '- Mention real table or domain names only when they are useful.',
        '- Keep each suggestion under 120 characters.',
        '',
        `Work type: ${input.workType}`,
        'Visible schema:',
        formatSchemaContext(input.tables),
    ].join('\n');
}

export async function generateWorkGoalSuggestions(ctx: ActionContext<WebActionServices>, input: WorkGoalSuggestionInput) {
    if (!ctx.services.req) return { suggestions: [] };

    const tables = await inspectSchema(ctx, input.connectionId);
    if (!tables.length) return { suggestions: [] };

    try {
        const { model, preset, modelName, providerKey, gateway } = await resolveAiLanguageModel({
            role: 'title',
            organizationId: ctx.organizationId,
            req: ctx.services.req,
        });
        const { text } = await generateText({
            model,
            system: compileSystemPrompt(preset.system) ?? 'Return valid JSON only, with no markdown.',
            prompt: buildSuggestionPrompt({ ...input, locale: ctx.locale, tables }),
            temperature: preset.temperature,
            maxOutputTokens: Math.max(preset.maxOutputTokens ?? 256, 256),
            context: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                feature: 'work_goal_suggestions',
                model: modelName,
                provider: providerKey,
                gateway,
            },
        });

        return { suggestions: parseSuggestions(text) };
    } catch (error) {
        console.error('[action/work.suggestGoals] failed:', error);
        return { suggestions: [] };
    }
}

export const workSuggestGoalsAction = defineWebAction({
    id: 'work.suggestGoals',
    domain: 'work',
    kind: 'query',
    risk: 'read',
    inputSchema: z.object({
        connectionId: z.string().min(1),
        workType: workTypeSchema.default('investigation'),
    }),
    outputSchema: workGoalSuggestionsOutputSchema,
    permissions: readConnection,
    scopes: ['connections:read'],
    actors: ['user', 'automation'],
    handler: generateWorkGoalSuggestions,
});
