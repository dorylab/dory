import { Marked, Renderer } from 'marked';
import type { WorkVisual, WorkDocumentView, WorkEvidence } from '@dory/shared/types/work-document';
export function escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
export function formatWorkValue(value: unknown) {
    return value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
}

/** Same snapshot and SVG are used on screen, in HTML and when printing to PDF. */
export function workChartSvg(visual: WorkVisual, evidence: WorkEvidence): string {
    if (!visual.chart) return '';
    if (visual.chart.yKeys) {
        // Separate scales keep differently sized metrics (e.g. revenue and order
        // counts) readable without implying that they share the same units.
        const { type, xKey, yKeys } = visual.chart;
        const panels = yKeys.map(({ key, label }, index) => {
            const svg = workChartSvg({ ...visual, title: label ?? key, chart: { type: type === 'pie' ? 'pie' : type, xKey, yKey: key } }, evidence);
            return `<g transform="translate(0,${index * 314})"><text x="65" y="20" fill="currentColor" font-size="14">${escapeHtml(label ?? key)}</text>${svg.replace('<svg ', '<svg y="24" width="660" height="290" ')}</g>`;
        });
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 ${314 * yKeys.length}" data-multiple-series="true" role="img" aria-label="${escapeHtml(visual.title)}">${panels.join('')}</svg>`;
    }
    const { xKey, yKey, type } = visual.chart;
    const points = evidence.rows
        .filter(row => row[yKey] !== null && row[yKey] !== undefined && String(row[yKey]).trim() !== '')
        .map(row => ({ label: formatWorkValue(row[xKey]), value: Number(row[yKey]) }))
        .filter(point => Number.isFinite(point.value));
    if (!points.length) return '';
    if (type === 'pie') {
        const total = points.reduce((sum, point) => sum + point.value, 0);
        if (points.some(point => point.value < 0) || total <= 0) return '';
        let angle = -Math.PI / 2;
        const slices = points
            .map((point, index) => {
                const next = angle + (point.value / total) * Math.PI * 2;
                const start = [180 + 100 * Math.cos(angle), 145 + 100 * Math.sin(angle)];
                const end = [180 + 100 * Math.cos(next), 145 + 100 * Math.sin(next)];
                // Match the existing blue theme defaults when an SVG is exported without host CSS.
                const defaults = [
                    'oklch(80.9% 0.105 251.813)',
                    'oklch(62.3% 0.214 259.815)',
                    'oklch(54.6% 0.245 262.881)',
                    'oklch(48.8% 0.243 264.376)',
                    'oklch(42.4% 0.199 265.638)',
                ];
                const color = `var(--chart-${(index % 5) + 1},${defaults[index % 5]})`;
                const title = `${escapeHtml(point.label)}: ${point.value} (${((point.value / total) * 100).toFixed(1)}%)`;
                const slice =
                    point.value === total
                        ? `<circle cx="180" cy="145" r="100" fill="${color}"><title>${title}</title></circle>`
                        : `<path d="M180,145 L${start.join(',')} A100,100 0 ${next - angle > Math.PI ? 1 : 0},1 ${end.join(',')} Z" fill="${color}"><title>${title}</title></path>`;
                angle = next;
                return `${slice}<rect x="310" y="${40 + index * 22}" width="12" height="12" fill="${color}"/><text x="330" y="${51 + index * 22}" fill="currentColor" font-size="12">${title}</text>`;
            })
            .join('');
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 ${Math.max(290, 70 + points.length * 22)}" role="img" aria-label="${escapeHtml(visual.title)}" data-chart-type="pie">${slices}</svg>`;
    }
    const low = Math.min(0, ...points.map(point => point.value));
    const high = Math.max(0, ...points.map(point => point.value));
    const range = high - low || 1;
    const y = (value: number) => 230 - ((value - low) / range) * 200;
    const step = 560 / points.length;
    const x = (i: number) => 65 + step * (i + 0.5);
    const body =
        type === 'area'
            ? `<polygon fill="var(--chart-1,currentColor)" fill-opacity=".25" stroke="var(--chart-1,currentColor)" points="${x(0)},${y(0)} ${points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} ${x(points.length - 1)},${y(0)}"/>`
            : type === 'line'
              ? `<polyline fill="none" stroke="var(--chart-1,currentColor)" stroke-width="3" points="${points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}"/>`
              : points
                    .map(
                        (p, i) =>
                            `<rect x="${x(i) - step * 0.35}" y="${Math.min(y(0), y(p.value))}" width="${step * 0.7}" height="${Math.max(1, Math.abs(y(0) - y(p.value)))}" fill="var(--chart-1,currentColor)"><title>${escapeHtml(p.label)}: ${p.value}</title></rect>`,
                    )
                    .join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 290" role="img" aria-label="${escapeHtml(visual.title)}"><line x1="65" x2="625" y1="${y(0)}" y2="${y(0)}" stroke="currentColor" opacity=".3"/>${[low, (low + high) / 2, high].map(value => `<text x="58" y="${y(value) + 4}" text-anchor="end" fill="currentColor" font-size="11">${escapeHtml(value.toLocaleString(undefined, { maximumFractionDigits: 2 }))}</text>`).join('')}${body}${points
        .filter((_, i) => i % Math.max(1, Math.ceil(points.length / 8)) === 0)
        .map(p => `<text x="${x(points.indexOf(p))}" y="257" text-anchor="middle" fill="currentColor" font-size="11">${escapeHtml(p.label.slice(0, 18))}</text>`)
        .join('')}</svg>`;
}
export function workTableHtml(evidence: WorkEvidence) {
    return `<div class="work-table-scroll" tabindex="0"><table><thead><tr>${evidence.columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${evidence.rows.map(row => `<tr>${evidence.columns.map(column => `<td>${escapeHtml(formatWorkValue(row[column]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function workVisualHtml(visual: WorkVisual, evidence: WorkEvidence, includeSources = true): string {
    const body =
        visual.type === 'chart'
            ? workChartSvg(visual, evidence)
            : visual.type === 'table'
              ? workTableHtml(evidence)
              : `<strong class="metric">${escapeHtml(evidence.rows[visual.metric?.rowIndex ?? 0]?.[visual.metric?.column ?? ''])}</strong>`;
    return `<figure data-visual="${escapeHtml(visual.id)}" data-visual-type="${visual.type}"><figcaption>${escapeHtml(visual.title)}</figcaption>${body}${includeSources ? `<p class="source"><a href="dory://evidence/${escapeHtml(evidence.artifactId)}" data-evidence="${escapeHtml(evidence.artifactId)}">${escapeHtml(evidence.connectionName ?? evidence.attachmentSource?.files.map(file => file.filename).join(', ') ?? evidence.connectionId ?? '')} · ${escapeHtml(evidence.capturedAt)}${evidence.truncated ? ' · Preview / 数据预览' : ''}</a></p>` : evidence.truncated ? '<p class="source">Preview / 数据预览</p>' : ''}</figure>`;
}
export function renderWorkMarkdown(content: WorkDocumentView['content'], includeSources = true): string {
    const parser = new Marked({ gfm: true });
    parser.use({
        renderer: {
            html: ({ text }) => escapeHtml(text),
            table(token) {
                return `<div class="work-table-scroll" tabindex="0">${Renderer.prototype.table.call(this, token)}</div>`;
            },
            paragraph({ tokens }) {
                const body = this.parser.parseInline(tokens);
                return tokens.some(token => token.type === 'image' && token.href.startsWith('dory://visual/')) ? body + '\n' : `<p>${body}</p>\n`;
            },
            image: ({ href, text }) => {
                const id = href.startsWith('dory://visual/') ? href.slice('dory://visual/'.length) : null;
                const visual = content.visuals.find(item => item.id === id);
                const evidence = visual && content.evidence.find(item => item.artifactId === visual.evidenceId);
                return visual && evidence
                    ? workVisualHtml(visual, evidence, includeSources)
                    : `<span class="source">${escapeHtml(text)}${includeSources ? ` (${escapeHtml(href)})` : ''}</span>`;
            },
            link({ href, tokens }) {
                const label = this.parser.parseInline(tokens);
                const id = /^dory:\/\/evidence\/([a-zA-Z0-9_-]+)$/.exec(href)?.[1];
                if (id) return includeSources ? `<a href="#evidence-${escapeHtml(id)}" data-evidence="${escapeHtml(id)}">${label}</a>` : label;
                return /^(https?:\/\/|mailto:|#)/i.test(href) ? `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${label}</a>` : label;
            },
        },
    });
    return parser.parse(content.markdown, { async: false });
}
export const workPrintStyles = `:root{--chart-1:oklch(80.9% .105 251.813);--chart-2:oklch(62.3% .214 259.815);--chart-3:oklch(54.6% .245 262.881);--chart-4:oklch(48.8% .243 264.376);--chart-5:oklch(42.4% .199 265.638)}body{font:16px/1.6 system-ui,sans-serif;color:#171717;background:white;max-width:960px;margin:40px auto;padding:24px}h1{line-height:1.2}h2{font-size:22px;margin-top:32px}.source,header p{font-size:12px;color:#666}.metric{font-size:36px}figure{margin:32px 0}figcaption{font-weight:600}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;overflow-wrap:anywhere}svg{max-height:400px;width:100%;color:#333}svg[data-multiple-series]{max-height:none}blockquote{border-left:3px solid #888;margin-left:0;padding-left:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:inherit}@media print{body{margin:0;padding:0}svg,tr{break-inside:avoid}h1,h2,h3,h4,figcaption{break-after:avoid}figure[data-visual-type="chart"],figure[data-visual-type="metric"],li{break-inside:avoid}thead{display:table-header-group}@page{margin:18mm}}`;
export function renderWorkHtml(document: WorkDocumentView): string {
    const sources = document.content.evidence
        .map(
            item =>
                `<li id="evidence-${escapeHtml(item.artifactId)}">${escapeHtml(item.connectionName ?? item.attachmentSource?.files.map(file => file.filename).join(', ') ?? item.connectionId ?? '')} · ${escapeHtml(item.title)} · ${escapeHtml(item.capturedAt)}</li>`,
        )
        .join('');
    // Export references resolve within the document; SQL is intentionally absent.
    const body = renderWorkMarkdown(document.content).replace(/href="dory:\/\/evidence\/([^"<>]+)"/g, 'href="#evidence-$1"');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(document.title)}</title><style>${workPrintStyles}</style></head><body><header><h1>${escapeHtml(document.title)}</h1><p>v${document.version ?? document.revision} · ${escapeHtml(document.updatedAt)}${document.status === 'draft' ? ' · Incomplete / 未完成' : ''}</p></header>${body}<footer><h2>Sources / 来源</h2><ul>${sources}</ul></footer></body></html>`;
}
