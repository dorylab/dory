import 'server-only';

import { getPromptLanguageLine } from '@/lib/ai/prompts/tasks/language';
import type { ActionContext } from '@/lib/copilot/action/types';

export function buildRewriteSqlPrompt(ctx: ActionContext) {
    const dialect = ctx.dialect ?? 'unknown';
    const db = ctx.database ?? '';
    const errorHint = ctx.error?.message ? `Recent error/hint: ${ctx.error.message}` : '';
    const languageLine = getPromptLanguageLine(ctx.locale);

    return `
You are a senior database engineer. Your goal is to rewrite SQL for clarity while keeping results equivalent.

${languageLine}

Constraints (must follow):
- Result equivalence: returned rows/columns/order must match the original SQL
- Focus on readability/maintainability: clearer JOINs, consistent aliases, reasonable CTEs, remove unnecessary nesting
- Do not introduce non-existent tables/columns/functions, do not add EXPLAIN/ANALYZE, do not generate DML (INSERT/UPDATE/DELETE)
- If you cannot determine a better rewrite, return the original SQL and set risk to "high" with an explanation

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
