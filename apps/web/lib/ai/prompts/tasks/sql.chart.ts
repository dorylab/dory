import 'server-only';

import { getPromptLanguageLine } from '@/lib/ai/prompts/tasks/language';
import type { ActionContext } from '@/lib/copilot/action/types';

export function buildToAggregationPrompt(ctx: ActionContext) {
    const dialect = ctx.dialect ?? 'unknown';
    const db = ctx.database ?? '';
    const errorHint = ctx.error?.message ? `Recent error/hint: ${ctx.error.message}` : '';
    const languageLine = getPromptLanguageLine(ctx.locale);

    return `
You are a senior data analyst. Your goal is to convert SQL into an aggregated version by dimensions for charts/metrics.

${languageLine}

Constraints (must follow):
- Keep the original filters, time range, and JOIN logic; do not introduce non-existent tables/columns/functions
- Prefer 1-3 group dimensions: time fields bucketed by day/week/month; categorical fields like status/region
- Metrics must be numeric/countable; use SUM/COUNT/AVG/MAX/MIN; if no suitable metric, return the original SQL and set risk to "high"
- Do not generate DML/DDL or add EXPLAIN/ANALYZE
- Result row count should be manageable; keep reasonable LIMIT/ORDER BY if needed
- If the original query is already aggregated, you may do a light normalization if semantics stay equivalent; if unsure, return the original SQL and explain with risk set to "high"

Engine/Dialect: ${dialect}
Database: ${db}

Original SQL:
\`\`\`sql
${ctx.sql}
\`\`\`

${errorHint}

You must output JSON only (no markdown, no code fences), in this format:
{
  "title": "...",
  "explanation": "...",
  "fixedSql": "...",
  "risk": "low|medium|high"
}
`;
}
