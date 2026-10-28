import type { WorkDocumentView } from '@dory/shared/types/work-document';
import { strToU8, zipSync } from 'fflate';
import { Marked, type Token } from 'marked';

import { reportMetrics } from './format';
import { escapeHtml, formatWorkValue, reportPresentation, workChartSvg } from './render';
import { editableReport, parseReport, resolvedReport } from './report-core';

export function markdownExportFiles(document: WorkDocumentView): Record<string, Uint8Array> {
    document = { ...document, content: reportPresentation(document.content, document.title) };
    const files: Record<string, Uint8Array> = {};
    const parser = new Marked({ gfm: true });
    const cell = (value: unknown) =>
        formatWorkValue(value)
            .replace(/([\\`*_{}\[\]<>|])/g, '\\$1')
            .replace(/\r?\n/g, ' ');
    const transform = (token: Token): string => {
        if (token.type === 'image' && token.href.startsWith('dory://visual/')) {
            const visual = document.content.visuals.find(item => `dory://visual/${item.id}` === token.href);
            const evidence = visual && document.content.evidence.find(item => item.artifactId === visual.evidenceId);
            if (!visual || !evidence) throw new Error('Missing exported visual evidence.');
            if (visual.type === 'chart') {
                const path = `assets/${visual.id}.svg`;
                files[path] = strToU8(workChartSvg(visual, evidence));
                return `![${cell(visual.title)}](${path})`;
            }
            if (visual.type === 'metric')
                return reportMetrics(visual, evidence)
                    .map(item => `**${cell(item.label)}: ${cell(item.value)}**${item.comparison ? ` (${cell(item.comparison)})` : ''}`)
                    .join('\n\n');
            const csvPath = `data/${visual.id}.csv`;
            files[csvPath] = strToU8(snapshotCsv(evidence));
            return (
                [
                    '| ' + evidence.columns.map(cell).join(' | ') + ' |',
                    '| ' + evidence.columns.map(() => '---').join(' | ') + ' |',
                    ...evidence.rows.slice(0, 50).map(row => '| ' + evidence.columns.map(column => cell(row[column])).join(' | ') + ' |'),
                ].join('\n') + `\n\n[Snapshot CSV](${csvPath}) · ${evidence.rows.length} saved rows${evidence.truncated ? ' · Data subset / 数据子集' : ''}`
            );
        }
        if (token.type === 'link' && token.href.startsWith('dory://evidence/')) {
            const index = document.content.evidence.findIndex(item => `dory://evidence/${item.artifactId}` === token.href);
            if (index < 0) throw new Error('Missing exported evidence.');
            return `${token.text} [${index + 1}]`;
        }
        if (token.type === 'html') return escapeHtml(token.raw);
        if (token.type === 'image') return token.text;
        if (token.type === 'link') {
            const label = token.tokens?.map(transform).join('') ?? token.text;
            return /^(https?:\/\/|mailto:|#)/i.test(token.href) ? `[${label}](<${token.href.replace(/>/g, '%3E')}>)` : label;
        }
        // Replace exact child spans only inside their owning token, never in code fences.
        const raw = token.raw;
        let cursor = 0;
        const children =
            'tokens' in token
                ? token.tokens
                : token.type === 'list'
                  ? token.items
                  : token.type === 'table'
                    ? [...token.header, ...token.rows.flat()].flatMap(cell => cell.tokens)
                    : undefined;
        if (children) {
            let result = '';
            for (const child of children) {
                const index = raw.indexOf(child.raw, cursor);
                if (index < 0) continue;
                result += raw.slice(cursor, index) + transform(child);
                cursor = index + child.raw.length;
            }
            return result + raw.slice(cursor);
        }
        return raw;
    };
    const markdown = parser.lexer(document.content.markdown).map(transform).join('');
    const sources = document.content.evidence
        .map((e, index) => `${index + 1}. ${cell(e.connectionName ?? e.connectionId)} — ${cell(e.title)} — ${e.capturedAt}${e.truncated ? ' (Preview / 数据预览)' : ''}`)
        .join('\n');
    files['report.md'] = strToU8(
        `# ${cell(document.title)}\n\n${document.publication ? `Published v${document.publication.number}` : `Draft r${document.revision}`} · ${document.updatedAt}\n\n${markdown}\n\n## Sources / 来源\n\n${sources}\n`,
    );
    return files;
}
export function exportMarkdownZip(document: WorkDocumentView): Uint8Array {
    return zipSync(markdownExportFiles(document));
}

export function snapshotCsv(evidence: WorkDocumentView['content']['evidence'][number]) {
    const cell = (value: unknown) => {
        let text = formatWorkValue(value);
        // Spreadsheet programs must not interpret user data as formulas.
        if (typeof value !== 'number' && /^\s*[=+@-]/.test(text)) text = "'" + text;
        return '"' + text.replaceAll('"', '""') + '"';
    };
    return [evidence.columns.map(cell).join(','), ...evidence.rows.map(row => evidence.columns.map(key => cell(row[key])).join(','))].join('\r\n');
}
export function exportDoryMdxZip(document: WorkDocumentView): Uint8Array {
    const content = editableReport(document.content);
    resolvedReport(content);
    const evidence = content.evidence.map(item => ({
        snapshotId: item.snapshotId,
        artifactId: item.artifactId,
        title: item.title,
        connectionName: item.connectionName,
        capturedAt: item.capturedAt,
        columns: item.columns,
        columnTypes: item.columnTypes,
        rows: item.rows,
        rowCount: item.rowCount,
        truncated: item.truncated,
    }));
    let body = content.body!;
    const tree = parseReport(body, content.visuals).tree!;
    const removals: Array<{ start: number; end: number; value: string }> = [];
    const stripSources = (node: import('mdast').Nodes) => {
        if ((node.type === 'link' || node.type === 'definition') && node.url.startsWith('dory://')) {
            removals.push({
                start: node.position!.start.offset!,
                end: node.position!.end.offset!,
                value: node.type === 'link' ? node.children.map(child => ('value' in child ? child.value : '')).join('') : '',
            });
            return;
        }
        if ('children' in node) node.children.forEach(stripSources);
    };
    stripSources(tree);
    for (const removal of removals.reverse()) body = body.slice(0, removal.start) + removal.value + body.slice(removal.end);
    return zipSync({
        'report.mdx': strToU8(body),
        'manifest.json': strToU8(
            JSON.stringify(
                {
                    schemaVersion: 1,
                    format: 'restricted-mdx',
                    title: document.title,
                    revision: document.revision,
                    publication: document.publication ?? null,
                    exportedAt: new Date().toISOString(),
                    embeds: content.embeds,
                    snapshots: evidence,
                },
                null,
                2,
            ),
        ),
    });
}
