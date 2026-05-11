import 'server-only';

import type { ConnectionDialect } from '@dory/shared';
import type { Locale } from '@dory/i18n/routing';
import { hydrateActionContext } from './hydrate-action-context';
import { executeGenerateSql } from './quick-actions/generate-sql/executor';

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
    model?: string | null;
};

export async function runInlineAskSqlGeneration(
    input: InlineAskInput,
    options: {
        organizationId: string;
        userId: string;
        locale?: Locale;
    },
) {
    const baseCtx = {
        organizationId: options.organizationId,
        userId: options.userId,
        connectionId: input.connectionId,
        dialect: input.dialect,
        sql: input.editorSql,
        instruction: input.prompt,
        database: input.database ?? undefined,
        activeSchema: input.activeSchema ?? undefined,
        candidateTables: input.candidateTables ?? undefined,
        locale: options.locale,
        model: input.model ?? null,
    };

    const ctx = await hydrateActionContext(baseCtx);
    return executeGenerateSql(ctx);
}
