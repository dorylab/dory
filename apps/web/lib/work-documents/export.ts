import { strToU8, zipSync } from 'fflate';
import { Marked, type Token } from 'marked';
import type { WorkDocumentView } from '@dory/shared/types/work-document';
import { escapeHtml, formatWorkValue, workChartSvg } from './render';

export function markdownExportFiles(document: WorkDocumentView): Record<string, Uint8Array> {
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
            if (visual.type === 'metric') return `**${cell(visual.title)}: ${cell(evidence.rows[visual.metric!.rowIndex]?.[visual.metric!.column])}**`;
            return [
                '| ' + evidence.columns.map(cell).join(' | ') + ' |',
                '| ' + evidence.columns.map(() => '---').join(' | ') + ' |',
                ...evidence.rows.map(row => '| ' + evidence.columns.map(column => cell(row[column])).join(' | ') + ' |'),
            ].join('\n');
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
    files['report.md'] = strToU8(`# ${cell(document.title)}\n\nv${document.revision} · ${document.updatedAt}\n\n${markdown}\n\n## Sources / 来源\n\n${sources}\n`);
    return files;
}
export function exportMarkdownZip(document: WorkDocumentView): Uint8Array {
    return zipSync(markdownExportFiles(document));
}
