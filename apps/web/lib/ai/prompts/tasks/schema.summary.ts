import { formatTypeForPrompt } from '@/lib/utils/format-type-for-prompt';
import type { TablePropertiesRow } from '@/types/table-info';
import { getPromptLanguageLine } from '@/lib/ai/prompts/tasks/language';

type PromptColumnInput = {
    name: string;
    type?: string;
    comment?: string | null;
    defaultValue?: string | null;
    nullable?: boolean;
    semanticTags?: string[];
};

const MAX_COLS_FOR_PROMPT = 60;
const MAX_COMMENT_LEN = 80;

export function buildColumnLinesForPrompt(cols: PromptColumnInput[]) {
    const used = cols.slice(0, MAX_COLS_FOR_PROMPT);

    const lines = used.map(col => {
        const displayType = formatTypeForPrompt(col.type);
        const tags = (col.semanticTags || []).join(',');
        const parts: string[] = [];

        parts.push(`name=${col.name}`);
        parts.push(`type=${displayType}`);

        if (tags) {
            parts.push(`tags=${tags}`);
        }

        if (col.comment) {
            const c = col.comment.length > MAX_COMMENT_LEN ? col.comment.slice(0, MAX_COMMENT_LEN) + '...' : col.comment;
            parts.push(`comment=${c}`);
        }

        return '- ' + parts.join(' | ');
    });

    return { lines, usedCount: used.length };
}

export function buildTableSummaryPrompt(input: {
    dbType?: string | null;
    database?: string | null;
    table?: string | null;
    properties?: TablePropertiesRow | null;
    columns: PromptColumnInput[];
    locale?: string | null;
}) {
    const { dbType, database, table, properties, columns, locale } = input;
    const languageLine = getPromptLanguageLine(locale);

    const propertyLines = properties
        ? [
            properties.engine ? `Engine: ${properties.engine}` : '',
            properties.primaryKey ? `Primary key: ${properties.primaryKey}` : '',
            properties.partitionKey ? `Partition key: ${properties.partitionKey}` : '',
            properties.comment ? `Comment: ${properties.comment}` : '',
        ]
            .filter(Boolean)
            .join('\n')
        : '';

    const { lines: columnLines, usedCount } = buildColumnLinesForPrompt(columns);

    const extraColNote =
        columns.length > usedCount
            ? `(The remaining ${columns.length - usedCount} columns are omitted for brevity.)`
            : '';

    return [
        'You are a table summary assistant. Return a JSON object with:',
        '- summary: 40-80 words, describing table purpose and key fields',
        '- detail: 150-260 words, covering business context, typical queries, time/partition meaning, write patterns',
        '- highlights: 3-6 items, each { field, description }, field must come from the input column list',
        '- snippets: 3-5 items, each { title, sql }, sql must be executable',
        languageLine,
        'Output JSON only (no code fences or extra text).',
        'Prefer primary keys, time fields, partition fields, geo fields, and core metrics for highlights.',
        'SQL snippets should be diverse: basic query, filter/aggregation, grouped stats, time filter, geo/partition example when relevant.',
        dbType ? `Database type: ${dbType}` : '',
        database ? `Database: ${database}` : '',
        table ? `Table: ${table}` : '',
        propertyLines ? `Table properties:\n${propertyLines}` : '',
        'Columns:',
        ...columnLines,
        extraColNote,
    ]
        .filter(Boolean)
        .join('\n');
}
