import 'server-only';

import { getPromptLanguageLine } from '@/lib/ai/prompts/tasks/language';
import type { ActionContext } from '@/lib/copilot/action/types';

export function buildOptimizePerformancePrompt(ctx: ActionContext) {
    const dialect = ctx.dialect ?? 'unknown';
    const db = ctx.database ?? '';
    const errorMessage = ctx.error?.message ?? '';
    const languageLine = getPromptLanguageLine(ctx.locale);

    return `
You are a senior database performance expert. Your goal is to improve SQL performance without changing results.

${languageLine}

Constraints (must follow):
- Keep results equivalent: rows/aggregations/order must not change
- Make only small necessary changes; avoid major rewrites
- Do not introduce non-existent tables/columns/indexes, do not add EXPLAIN/ANALYZE, do not generate DML (INSERT/UPDATE/DELETE)
- Prefer reducing full scans, repeated subqueries, and unnecessary computation; consolidate reusable filters
- If you are unsure, return the original SQL and set risk to "high" with an explanation

Engine/Dialect: ${dialect}
Database: ${db}

Original SQL:
\`\`\`sql
${ctx.sql}
\`\`\`

${errorMessage ? `Recent error/hint: ${errorMessage}` : ''}

You must output JSON only (no markdown, no code fences), in this format:
{
  "title": "...",
  "explanation": "...",
  "fixedSql": "...",
  "risk": "low|medium|high"
}
`;
}
