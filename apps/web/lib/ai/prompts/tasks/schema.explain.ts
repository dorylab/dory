import { getPromptLanguageLine } from '@/lib/ai/prompts/tasks/language';

type PromptColumnInput = {
    name: string;
    type?: string;
    comment?: string | null;
    defaultValue?: string | null;
    nullable?: boolean;
    semanticTags?: string[];
};

export function buildSchemaExplanationPrompt(input: {
    columns: PromptColumnInput[];
    dbType?: string | null;
    database?: string | null;
    table?: string | null;
    locale?: string | null;
}) {
    const { columns, dbType, database, table, locale } = input;
    const languageLine = getPromptLanguageLine(locale);

    return [
        'You are a schema explanation assistant. Write a short explanation (15-25 words) for each column.',
        languageLine,
        'Output format: {"columns":[{"name":"column","semanticSummary":"summary"}]} and output JSON only (no Markdown or extra text).',
        dbType ? `Database type: ${dbType}` : '',
        database ? `Database: ${database}` : '',
        table ? `Table: ${table}` : '',
        'Columns:',
        ...columns.map(col => {
            const comment = col.comment ? `, comment: ${col.comment}` : '';
            return `- ${col.name} (type: ${col.type ?? 'unknown'}${comment})`;
        }),
    ]
        .filter(Boolean)
        .join('\n');
}
