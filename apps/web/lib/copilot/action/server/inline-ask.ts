import 'server-only';

import type { ConnectionDialect } from '@dory/shared';
import type { Locale } from '@dory/i18n/routing';
import { hydrateActionContext } from './hydrate-action-context';
import { executeGenerateSql } from './quick-actions/generate-sql/executor';
import type { ActionContext } from '../types';

type InlineAskTableRef = {
    database?: string | null;
    schema?: string | null;
    name: string;
};

export type InlineAskInput = {
    prompt: string;
    editorSql: string;
    connectionId: string;
    dialect: ConnectionDialect;
    database?: string | null;
    activeSchema?: string | null;
    candidateTables?: InlineAskTableRef[] | null;
    schemaContext?: string | null;
    model?: string | null;
};

type InlineAskIdentity = {
    organizationId: string;
    userId: string;
    locale?: Locale;
};

function toInlineAskActionContext(input: InlineAskInput, options: InlineAskIdentity): ActionContext {
    return {
        organizationId: options.organizationId,
        userId: options.userId,
        connectionId: input.connectionId,
        dialect: input.dialect,
        sql: input.editorSql,
        instruction: input.prompt,
        database: input.database ?? undefined,
        activeSchema: input.activeSchema ?? undefined,
        candidateTables: input.candidateTables ?? undefined,
        schemaContext: input.schemaContext ?? undefined,
        locale: options.locale,
        model: input.model ?? null,
    };
}

export async function hydrateInlineAskInputForForwarding(input: InlineAskInput, options: InlineAskIdentity): Promise<InlineAskInput> {
    const ctx = await hydrateActionContext(toInlineAskActionContext(input, options));

    return {
        ...input,
        database: ctx.database ?? input.database ?? null,
        activeSchema: ctx.activeSchema ?? input.activeSchema ?? null,
        candidateTables: ctx.candidateTables ?? input.candidateTables ?? null,
        schemaContext: ctx.schemaContext ?? input.schemaContext ?? null,
    };
}

export async function runInlineAskSqlGeneration(input: InlineAskInput, options: InlineAskIdentity) {
    const ctx = await hydrateActionContext(toInlineAskActionContext(input, options));
    return executeGenerateSql(ctx);
}
