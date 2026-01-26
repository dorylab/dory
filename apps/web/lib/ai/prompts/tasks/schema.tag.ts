import { getPromptLanguageLine } from '@/lib/ai/prompts/tasks/language';

type PromptColumnInput = {
    name: string;
    type?: string;
    comment?: string | null;
    defaultValue?: string | null;
    nullable?: boolean;
    semanticTags?: string[];
};

export function buildColumnTaggingPrompt(input: {
    columns: PromptColumnInput[];
    dbType?: string | null;
    database?: string | null;
    table?: string | null;
    locale?: string | null;
}) {
    const { columns, dbType, database, table, locale } = input;
    const languageLine = getPromptLanguageLine(locale);

    return [
        'You are a schema tagging assistant. Provide 2-4 short tags and one short description for each column.',
        languageLine,
        'Example tags: primary key, identifier, time, dimension, amount, status, enum, low-cardinality, boolean, geo, JSON, array.',
        'Output must be JSON with a columns array, each item like:',
        '{ "name": "column", "semanticTags": ["tag1","tag2"], "semanticSummary": "one sentence" }',
        'Output JSON only (no Markdown, no code fences, no extra text).',
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
