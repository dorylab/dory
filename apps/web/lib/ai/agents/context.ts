import 'server-only';

import { buildSchemaContext, buildSchemaContextForTables, getDefaultSchemaSampleLimits } from '@/lib/ai/prompts';
import { buildDialectSqlPrompt, SYSTEM_PROMPT } from '@/lib/ai/prompts';
import type { CopilotEnvelopeV1 } from '@/app/(app)/[organization]/[connectionId]/chatbot/copilot/types/copilot-envelope';
import { toPromptContext } from '@/app/(app)/[organization]/[connectionId]/chatbot/copilot/copilot-envelope';
import type { Locale } from '@dory/i18n/routing';
import type { ConnectionType } from '@dory/shared/types/connections';

export type DoryAgentSchemaTableRef = {
    database?: string | null;
    schema?: string | null;
    name: string;
};

export type DoryAgentContext = {
    instructions: string;
    schemaContext: string | null;
    schemaContextTables: DoryAgentSchemaTableRef[];
};

type BuildDoryAgentContextOptions = {
    baseSystem: string;
    userLanguageInstruction: string;
    userId?: string | null;
    organizationId?: string | null;
    connectionId?: string | null;
    database?: string | null;
    activeSchema?: string | null;
    table?: string | null;
    tableSchema?: string | null;
    connectionType?: ConnectionType | null;
    sqlToolEnabled?: boolean;
    candidateTables?: DoryAgentSchemaTableRef[] | null;
    copilotEnvelope?: CopilotEnvelopeV1 | null;
    locale?: Locale;
};

function normalizeSchemaTableRef(value: unknown): DoryAgentSchemaTableRef | null {
    if (!value || typeof value !== 'object') return null;

    const record = value as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name) return null;

    const database = typeof record.database === 'string' && record.database.trim() ? record.database.trim() : null;
    const schema = typeof record.schema === 'string' && record.schema.trim() ? record.schema.trim() : null;

    return { database, schema, name };
}

function collectSchemaContextTables(candidateTables?: DoryAgentSchemaTableRef[] | null, copilotEnvelope?: CopilotEnvelopeV1 | null): DoryAgentSchemaTableRef[] {
    const seen = new Set<string>();
    const tables: DoryAgentSchemaTableRef[] = [];

    const addTable = (value: unknown) => {
        const table = normalizeSchemaTableRef(value);
        if (!table) return;

        const key = `${table.database ?? ''}:${table.schema ?? ''}:${table.name}`;
        if (seen.has(key)) return;

        seen.add(key);
        tables.push(table);
    };

    if (Array.isArray(candidateTables)) {
        for (const table of candidateTables) {
            addTable(table);
        }
    }

    if (copilotEnvelope?.surface === 'sql') {
        const inferredTables = copilotEnvelope.context.draft.inferred.tables;
        for (const table of inferredTables) {
            addTable({
                database: table.database ?? copilotEnvelope.context.draft.inferred.database ?? copilotEnvelope.context.baseline.database ?? null,
                schema: table.schema ?? copilotEnvelope.context.draft.inferred.schema ?? null,
                name: table.name,
            });
        }
    }

    return tables.slice(0, 12);
}

export async function buildDoryAgentContext(options: BuildDoryAgentContextOptions): Promise<DoryAgentContext> {
    const schemaContextTables = collectSchemaContextTables(options.candidateTables, options.copilotEnvelope);
    let schemaContext: string | null = null;

    if (options.userId && options.organizationId && options.connectionId) {
        const defaults = getDefaultSchemaSampleLimits();

        schemaContext = schemaContextTables.length
            ? await buildSchemaContextForTables({
                  userId: options.userId,
                  organizationId: options.organizationId,
                  datasourceId: options.connectionId,
                  database: options.database,
                  schema: options.activeSchema,
                  tables: schemaContextTables,
                  columnSampleLimit: defaults.column,
              })
            : null;

        schemaContext ??= await buildSchemaContext({
            userId: options.userId,
            organizationId: options.organizationId,
            datasourceId: options.connectionId,
            database: options.database,
            schema: options.activeSchema,
            table: options.table,
            tableSampleLimit: defaults.table,
            columnSampleLimit: defaults.column,
        });
    }

    const schemaSection = schemaContext
        ? `Schema Context\n${schemaContext}`
        : typeof options.tableSchema === 'string' && options.tableSchema.trim()
          ? `Database Context\n${options.tableSchema.trim()}`
          : '';

    const copilotContextSection = options.copilotEnvelope ? `Copilot Context\n${JSON.stringify(toPromptContext(options.copilotEnvelope), null, 2)}` : '';
    const sqlToolSection = options.sqlToolEnabled ? buildDialectSqlPrompt(options.connectionType ?? null) : '';

    return {
        instructions: [options.baseSystem, options.userLanguageInstruction, SYSTEM_PROMPT, sqlToolSection, copilotContextSection, schemaSection].filter(Boolean).join('\n\n'),
        schemaContext,
        schemaContextTables,
    };
}
