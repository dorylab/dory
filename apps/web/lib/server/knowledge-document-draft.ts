import { createHash } from 'node:crypto';
import type { SchemaGraphResult, SchemaGraphTableReference, TableColumnInfo } from '@dory/drivers/types';
import type { DocumentTopic } from '@dory/shared/types/knowledge-document-draft';
import { z } from 'zod';
import { safeParseJson } from '../ai/json-guard';

export type DocumentDraftFailure = 'invalid_json' | 'invalid_structure' | 'unknown_table' | 'unsupported_citation' | 'missing_tables' | 'truncated_output';
export class DocumentDraftValidationError extends Error {
    constructor(
        public readonly code: DocumentDraftFailure,
        message: string,
    ) {
        super(message);
        this.name = 'DocumentDraftValidationError';
    }
}
export const documentDraftFailureKeys = {
    invalid_json: 'InvalidDraftFormat',
    invalid_structure: 'InvalidDraftStructure',
    unknown_table: 'InvalidDraftTables',
    missing_tables: 'InvalidDraftTables',
    unsupported_citation: 'InvalidDraftReferences',
    truncated_output: 'DraftTruncated',
} as const satisfies Record<DocumentDraftFailure, string>;

export type Reference = { kind: 'document' | 'query'; id: string; title: string; text: string };
export type TableFacts = { name: string; comment: string | null; columns: TableColumnInfo[]; foreignKeys: string[] | null };

export function addConstraints(tables: TableFacts[], references: SchemaGraphTableReference[], graph?: SchemaGraphResult) {
    if (graph?.status !== 'ready') return;
    const selected = new Map<string, TableFacts>();
    tables.forEach((table, index) => {
        const ref = references[index];
        const node = graph.tables.find(item => item.name === ref.name && item.schema === ref.schema);
        if (!node) return;
        selected.set(node.id, table);
        if (graph.capabilities.relationships) table.foreignKeys = [];
        for (const column of table.columns) {
            const key = node.columns.find(item => item.name === column.columnName);
            if (!key) continue;
            if (key.isPrimaryKey) column.isPrimaryKey = true;
            column.columnType = key.dataType ?? column.columnType;
            column.nullable ??= column.isNullable ?? key.nullable;
        }
    });
    for (const edge of graph.relationships) {
        const from = selected.get(edge.sourceTableId),
            to = selected.get(edge.targetTableId);
        if (
            !from ||
            !to ||
            !edge.sourceColumns.every(name => from.columns.some(c => c.columnName === name)) ||
            !edge.targetColumns.every(name => to.columns.some(c => c.columnName === name))
        )
            continue;
        const label = edge.constraintName ? ' · ' + edge.constraintName : '';
        const fact = `${from.name}(${edge.sourceColumns.join(', ')}) → ${to.name}(${edge.targetColumns.join(', ')})${label}`;
        from.foreignKeys?.push(fact);
        if (to !== from) to.foreignKeys?.push(fact);
    }
}

const index = z.number().int().nonnegative();
const line = z.string().trim().min(1).max(1600);
const title = z
    .string()
    .trim()
    .min(1)
    .max(180)
    .refine(value => !/[/\\\x00-\x1f]/.test(value) && value !== '.' && value !== '..');
const outline = z.object({
    topics: z
        .array(
            z.object({
                name: title,
                documents: z
                    .array(
                        z.object({
                            title,
                            introduction: line,
                            tables: z.array(index).min(1).max(20),
                            citations: z.array(z.object({ reference: index, quote: line, explanation: line })).max(20),
                            questions: z.array(line).max(12),
                        }),
                    )
                    .min(1)
                    .max(30),
            }),
        )
        .min(1)
        .max(20),
});

function literal(value: unknown) {
    return String(value ?? '—')
        .replace(/[\r\n]+/g, ' ')
        .replace(/[\\`*_{}\[\]()<>#!|~]/g, '\\$&');
}
function flag(value: TableColumnInfo['nullable']) {
    if (value == null) return '?';
    if (/^(true|1|yes|y|t)$/i.test(String(value))) return '✓';
    if (/^(false|0|no|n|f)$/i.test(String(value))) return '✗';
    return '?';
}

export function renderDraft(
    text: string,
    source: { name: string; database: string },
    tables: TableFacts[],
    references: Reference[],
    label: (key: string) => string,
): DocumentTopic[] {
    let decoded: unknown;
    try {
        decoded = safeParseJson(text);
    } catch {
        throw new DocumentDraftValidationError('invalid_json', 'Return a single valid JSON object with a topics array. Do not append extra JSON objects or explanatory text.');
    }
    const result = outline.safeParse(decoded);
    if (!result.success) {
        const issues = result.error.issues
            .slice(0, 6)
            .map(issue => issue.path.join('.') + ': ' + issue.message)
            .join('; ');
        throw new DocumentDraftValidationError('invalid_structure', 'The draft structure is invalid. Correct these fields: ' + issues);
    }
    const plan = result.data;
    const covered = new Set<number>();
    const topics = plan.topics.map(topic => ({
        name: topic.name,
        documents: topic.documents.map(doc => {
            const refs = [...new Set(doc.tables)].map(i => {
                if (!tables[i])
                    throw new DocumentDraftValidationError(
                        'unknown_table',
                        `Unknown table reference ${i}. Use only the supplied zero-based table indexes 0 through ${tables.length - 1}.`,
                    );
                covered.add(i);
                return tables[i];
            });
            const content = ['# ' + literal(doc.title), literal(doc.introduction)];
            const used = new Set<number>();
            for (const citation of doc.citations) {
                const ref = references[citation.reference];
                if (!ref)
                    throw new DocumentDraftValidationError(
                        'unsupported_citation',
                        references.length
                            ? `Unsupported citation. Reference ${citation.reference} does not exist. Use only indexes from the references array, never table indexes.`
                            : 'Unsupported citation. No document or query references were selected. Every citations array must be empty. Schema metadata is not a document/query reference.',
                    );
                if (!ref.text.includes(citation.quote))
                    throw new DocumentDraftValidationError(
                        'unsupported_citation',
                        `Unsupported citation. The quote must be an exact substring of references[${citation.reference}].text. Do not paraphrase or invent quotes.`,
                    );
                used.add(citation.reference);
                const target = ref.kind === 'query' ? '?tab=queries&query=' : '?tab=documents&file=';
                content.push(
                    '**' + label(ref.kind === 'query' ? 'QueryExample' : 'DocumentEvidence') + '** · [' + literal(ref.title) + '](' + target + encodeURIComponent(ref.id) + ')',
                    citation.quote
                        .split(/\r?\n/)
                        .map(line => '> ' + literal(line))
                        .join('\n'),
                    literal(citation.explanation),
                );
            }
            if (doc.questions.length) content.push('## ' + label('Questions'), doc.questions.map(q => '- ' + literal(q)).join('\n'));
            content.push('## ' + label('Schema') + ' · ' + literal(source.name) + ' / ' + literal(source.database));
            const evidence = refs.map(table => {
                content.push('### ' + literal(table.name));
                if (table.comment) content.push(literal(table.comment));
                content.push(
                    [
                        '| ' + ['Field', 'Type', 'Nullable', 'PrimaryKey', 'Comment'].map(label).join(' | ') + ' |',
                        '| --- | --- | --- | --- | --- |',
                        ...table.columns.map(
                            c =>
                                '| ' +
                                [literal(c.columnName), literal(c.columnType), flag(c.nullable ?? c.isNullable), flag(c.isPrimaryKey), literal(c.comment)].join(' | ') +
                                ' |',
                        ),
                    ].join('\n'),
                );
                content.push(
                    label('ForeignKeys') +
                        ' · ' +
                        (table.foreignKeys === null ? label('Unknown') : table.foreignKeys.length ? table.foreignKeys.map(literal).join('; ') : label('NoKeys')),
                );
                return {
                    name: table.name,
                    digest: createHash('sha256')
                        .update(JSON.stringify({ ...table, foreignKeys: table.foreignKeys?.toSorted() ?? null }))
                        .digest('hex'),
                };
            });
            return {
                fileName: doc.title.replace(/\.md$/i, '') + '.md',
                contentText: content.join('\n\n'),
                evidence: { database: source.database, tables: evidence, references: [...used].map(i => ({ kind: references[i].kind, id: references[i].id })) },
            };
        }),
    }));
    if (covered.size !== tables.length) {
        const missing = tables.flatMap((_, index) => (covered.has(index) ? [] : [index]));
        throw new DocumentDraftValidationError('missing_tables', 'The draft omitted selected tables. Include these zero-based table indexes: ' + missing.join(', ') + '.');
    }
    return topics;
}
