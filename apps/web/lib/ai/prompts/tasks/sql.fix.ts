import 'server-only';

import { getPromptLanguageLine } from '@/lib/ai/prompts/tasks/language';
import type { ActionContext } from '@/lib/copilot/action/types';

export function buildFixSqlErrorPrompt(ctx: ActionContext) {
    const dialect = ctx.dialect ?? 'unknown';
    const db = ctx.database ?? '';
    const languageLine = getPromptLanguageLine(ctx.locale);

    return `
You are a senior database expert. Your goal is to fix this failed SQL while keeping changes minimal.

${languageLine}

Constraints (must follow):
- Make the minimal change required for the query to run
- Do not do performance optimization or style rewrites (do not convert comma joins to ANSI joins unless required)
- Do not introduce non-existent tables/columns/functions
- If you cannot determine a fix, return the original SQL and set risk to "high" with an explanation

Engine/Dialect: ${dialect}
Database: ${db}

Original SQL:
\`\`\`sql
${ctx.sql}
\`\`\`

Error message:
${ctx.error?.message ?? ''}

You must output JSON only (no markdown, no code fences), in this format:
{
  "title": "...",
  "explanation": "...",
  "fixedSql": "...",
  "risk": "low|medium|high"
}
`;
}
