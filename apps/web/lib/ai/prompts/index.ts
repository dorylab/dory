import { MAX_HISTORY_MESSAGES } from './compose';
import { renderPromptEntry } from './render';
import { buildSchemaContext, getDefaultSchemaSampleLimits, SCHEMA_PROMPT } from './contexts/schema';
import { SYSTEM_PROMPT } from './system/core';
import { buildSchemaExplanationPrompt } from './tasks/schema.explain';
import { buildColumnTaggingPrompt } from './tasks/schema.tag';
import { buildColumnLinesForPrompt, buildTableSummaryPrompt } from './tasks/schema.summary';
import { buildToAggregationPrompt } from './tasks/sql.chart';
import { buildFixSqlErrorPrompt } from './tasks/sql.fix';
import { buildOptimizePerformancePrompt } from './tasks/sql.optimize';
import { buildRewriteSqlPrompt } from './tasks/sql.rewrite';
import { buildTabTitlePrompt } from './tasks/sql.title';
import { CHART_BUILDER_GUIDE, SQL_RUNNER_GUIDE, SQL_TOOL_INSTRUCTION } from './tasks/sql.tools';
import { CHART_BUILDER_TOOL_DESCRIPTION } from './tasks/sql.chart-builder';

export * from './types';
export * from './compose';
export * from './render';
export * from './policy/output';
export * from './policy/safety';
export * from './system/core';
export * from './contexts/schema';
export * from './tasks/schema.explain';
export * from './tasks/schema.tag';
export * from './tasks/schema.summary';
export * from './tasks/sql.chart';
export * from './tasks/sql.fix';
export * from './tasks/sql.optimize';
export * from './tasks/sql.rewrite';
export * from './tasks/sql.title';
export * from './tasks/sql.tools';
export * from './tasks/sql.chart-builder';

export const promptRegistry = {
    'system.core': SYSTEM_PROMPT,
    'schema.context.template': SCHEMA_PROMPT,
    'schema.explain': buildSchemaExplanationPrompt,
    'schema.tag': buildColumnTaggingPrompt,
    'schema.summary': buildTableSummaryPrompt,
    'sql.chart': buildToAggregationPrompt,
    'sql.fix': buildFixSqlErrorPrompt,
    'sql.optimize': buildOptimizePerformancePrompt,
    'sql.rewrite': buildRewriteSqlPrompt,
    'sql.title': buildTabTitlePrompt,
    'sql.tools.instruction': SQL_TOOL_INSTRUCTION,
    'sql.tools.runnerGuide': SQL_RUNNER_GUIDE,
    'sql.tools.chartGuide': CHART_BUILDER_GUIDE,
    'sql.tools.chartBuilderDescription': CHART_BUILDER_TOOL_DESCRIPTION,
} as const;

export type PromptId = keyof typeof promptRegistry;

export function selectPrompt(id: PromptId, ctx?: unknown) {
    return renderPromptEntry(promptRegistry[id] as any, ctx);
}

export {
    MAX_HISTORY_MESSAGES,
    SYSTEM_PROMPT,
    SCHEMA_PROMPT,
    SQL_TOOL_INSTRUCTION,
    SQL_RUNNER_GUIDE,
    CHART_BUILDER_GUIDE,
    CHART_BUILDER_TOOL_DESCRIPTION,
    buildSchemaContext,
    getDefaultSchemaSampleLimits,
    buildSchemaExplanationPrompt,
    buildColumnTaggingPrompt,
    buildTableSummaryPrompt,
    buildColumnLinesForPrompt,
    buildToAggregationPrompt,
    buildFixSqlErrorPrompt,
    buildRewriteSqlPrompt,
    buildOptimizePerformancePrompt,
    buildTabTitlePrompt,
};
