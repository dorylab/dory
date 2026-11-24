import type { WorkDocumentView, WorkEvidence, WorkVisual } from '@dory/shared/types/work-document';
import { CHART_COLOR_PRESETS } from '@dory/shared/types/workspace-chart';
import { chartRows, formatChartNumber } from '@dory/shared/utils/chat-chart';
import { Marked, Renderer } from 'marked';

import { reportMetrics, reportNumber } from './format';
import { resolvedReport } from './report-core';

export function escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
export function formatWorkValue(value: unknown) {
    return value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
}

// Match the report theme when a standalone SVG has no host stylesheet.
const chartColors = ['oklch(80.9% 0.105 251.813)', 'oklch(62.3% 0.214 259.815)', 'oklch(54.6% 0.245 262.881)', 'oklch(48.8% 0.243 264.376)', 'oklch(42.4% 0.199 265.638)'];
const chartColor = (index: number) => `var(--chart-${(index % chartColors.length) + 1},${chartColors[index % chartColors.length]})`;

export function workChartSvg(visual: WorkVisual, evidence: WorkEvidence): string {
    if (visual.chartSpec) return workspaceChartSvg(visual);
    const chart = visual.chart;
    if (!chart) return '';
    const { type, xKey, yKeys, options } = chart;
    if (yKeys && chart.seriesLayout !== 'combined') {
        const panels = yKeys.map(({ key, label }, index) => {
            const svg = workChartSvg({ ...visual, title: label ?? key, chart: { type, xKey, yKey: key, options } }, evidence);
            return `<g transform="translate(0,${index * 314})"><text x="65" y="20" fill="currentColor" font-size="14">${escapeHtml(label ?? key)}</text>${svg.replace('<svg ', '<svg y="24" width="660" height="290" ')}</g>`;
        });
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 ${314 * yKeys.length}" data-multiple-series="true" role="img" aria-label="${escapeHtml(visual.title)}">${panels.join('')}</svg>`;
    }
    const formatValue = (value: unknown) => formatChartNumber(value, options?.valueFormat);
    const series = yKeys ?? [{ key: chart.yKey! }];
    const rows = chartRows({ type: 'chart', chartType: type, xKey, yKeys: series, options, data: evidence.rows });
    const stacked = options?.stacked && (type === 'bar' || type === 'area');
    const baselines = rows.map(() => 0);
    const plotted = series.map(item =>
        rows.flatMap((row, index) => {
            const value = reportNumber(row[item.key]);
            if (value === null) return [];
            const base = stacked ? baselines[index] : 0;
            const end = base + value;
            if (stacked) baselines[index] = end;
            return [{ label: formatWorkValue(row[xKey]), value, index, base, end }];
        }),
    );
    const points = plotted.flat();
    if (!points.length)
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 100" role="img" aria-label="No plottable values"><text x="20" y="50" fill="currentColor">No plottable values / 无可绘制的数据</text></svg>';
    if (type === 'pie') {
        const total = points.reduce((sum, point) => sum + point.value, 0);
        if (points.some(point => point.value < 0) || total <= 0) throw new Error('Pie charts require non-negative values and a positive total.');
        let angle = -Math.PI / 2;
        const slices = points
            .map((point, index) => {
                const next = angle + (point.value / total) * Math.PI * 2;
                const start = [180 + 100 * Math.cos(angle), 145 + 100 * Math.sin(angle)];
                const end = [180 + 100 * Math.cos(next), 145 + 100 * Math.sin(next)];
                const color = chartColor(index);
                const title = `${escapeHtml(point.label)}: ${escapeHtml(formatValue(point.value))} (${((point.value / total) * 100).toFixed(1)}%)`;
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
    const values = points.flatMap(point => [point.base, point.end]);
    const low = Math.min(0, ...values);
    const high = Math.max(0, ...values);
    const ticks = [low, (low + high) / 2, high];
    const formatTick = (value: number) => formatChartNumber(value, options?.valueFormat, 'en', true);
    const left = Math.min(180, Math.max(65, ...ticks.map(value => formatTick(value).length * 7 + (options?.yAxisLabel ? 30 : 10))));
    const range = high - low || 1;
    const y = (value: number) => 230 - ((value - low) / range) * 200;
    const step = (625 - left) / rows.length;
    const x = (i: number) => left + step * (i + 0.5);
    const multiple = series.length > 1;
    const names = series.map(item => item.label ?? item.key);
    const barWidth = (step * 0.7) / (stacked ? 1 : series.length);
    const body = plotted
        .map((points, index) => {
            const color = chartColor(index);
            const hint = (point: (typeof points)[number]) =>
                `<title>${escapeHtml(point.label)}${multiple ? ` / ${escapeHtml(names[index])}` : ''}: ${escapeHtml(formatValue(point.value))}</title>`;
            if (type === 'bar') {
                const offset = -step * 0.35 + (stacked ? 0 : index * barWidth);
                return points
                    .map(point => {
                        const top = Math.min(y(point.base), y(point.end));
                        const height = Math.max(1, Math.abs(y(point.base) - y(point.end)));
                        return `<rect x="${x(point.index) + offset}" y="${top}" width="${barWidth}" height="${height}" fill="${color}">${hint(point)}</rect>`;
                    })
                    .join('');
            }
            const segments: (typeof points)[] = [];
            for (const point of points) {
                const previous = segments.at(-1);
                if (previous && previous.at(-1)!.index === point.index - 1) previous.push(point);
                else segments.push([point]);
            }
            return segments
                .map(segment => {
                    const coordinates = segment.map(point => `${x(point.index)},${y(point.end)}`).join(' ');
                    const base = [...segment]
                        .reverse()
                        .map(point => `${x(point.index)},${y(point.base)}`)
                        .join(' ');
                    const shape =
                        type === 'area'
                            ? `<polygon fill="${color}" fill-opacity=".25" stroke="${color}" points="${coordinates} ${base}"/>`
                            : `<polyline fill="none" stroke="${color}" stroke-width="3" points="${coordinates}"/>`;
                    return shape + segment.map(point => `<circle cx="${x(point.index)}" cy="${y(point.end)}" r="3" fill="${color}">${hint(point)}</circle>`).join('');
                })
                .join('');
        })
        .join('');
    const legend = multiple
        ? names
              .map((name, index) => {
                  const left = 65 + (index % 3) * 195;
                  const top = 292 + Math.floor(index / 3) * 20;
                  const label = name.length > 22 ? `${name.slice(0, 22)}…` : name;
                  return `<g><title>${escapeHtml(name)}</title><rect x="${left}" y="${top}" width="10" height="10" fill="${chartColor(index)}"/><text x="${left + 15}" y="${top + 9}" fill="currentColor" font-size="11">${escapeHtml(label)}</text></g>`;
              })
              .join('')
        : '';
    const height = multiple ? 290 + Math.ceil(series.length / 3) * 20 : 290;
    const axisLabels = `${options?.xAxisLabel ? `<text x="${(left + 625) / 2}" y="280" text-anchor="middle" fill="currentColor" font-size="12">${escapeHtml(options.xAxisLabel)}</text>` : ''}${options?.yAxisLabel ? `<text transform="translate(14 130) rotate(-90)" text-anchor="middle" fill="currentColor" font-size="12">${escapeHtml(options.yAxisLabel)}</text>` : ''}`;
    const categories = multiple ? rows.map((row, index) => ({ label: formatWorkValue(row[xKey]), index })) : points;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 ${height}" role="img" aria-label="${escapeHtml(visual.title)}"><line x1="${left}" x2="625" y1="${y(0)}" y2="${y(0)}" stroke="currentColor" opacity=".3"/>${ticks.map(value => `<text x="${left - 7}" y="${y(value) + 4}" text-anchor="end" fill="currentColor" font-size="11">${escapeHtml(formatTick(value))}</text>`).join('')}${axisLabels}${body}${legend}${categories
        .filter((_, i) => i % Math.max(1, Math.ceil(categories.length / 8)) === 0)
        .map(p => `<text x="${x(p.index)}" y="257" text-anchor="middle" fill="currentColor" font-size="11">${escapeHtml(p.label.slice(0, 18))}</text>`)
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
              : `<div class="report-metrics">${reportMetrics(visual, evidence)
                    .map(
                        item =>
                            `<div><span>${escapeHtml(item.label)}</span><strong class="metric">${escapeHtml(item.value)}</strong>${item.comparison ? `<small>${escapeHtml(item.comparison)}</small>` : ''}</div>`,
                    )
                    .join('')}</div>`;
    return `<figure data-visual="${escapeHtml(visual.id)}" data-visual-type="${visual.type}"><figcaption>${escapeHtml(visual.title)}</figcaption>${body}${includeSources ? `<p class="source"><a href="dory://evidence/${escapeHtml(evidence.artifactId)}" data-evidence="${escapeHtml(evidence.artifactId)}">${escapeHtml(evidence.connectionName ?? evidence.attachmentSource?.files.map(file => file.filename).join(', ') ?? evidence.connectionId ?? '')} · ${escapeHtml(evidence.capturedAt)}${evidence.truncated ? ' · Preview / 数据预览' : ''}</a></p>` : evidence.truncated ? '<p class="source">Preview / 数据预览</p>' : ''}</figure>`;
}
export function reportPresentation(content: WorkDocumentView['content'], title?: string) {
    const resolved = resolvedReport(content);
    if (!title) return resolved;
    const first = new Marked({ gfm: true }).lexer(resolved.markdown).find(token => token.type !== 'space');
    if (first?.type !== 'heading' || first.depth !== 1 || first.text !== title) return resolved;
    const start = resolved.markdown.indexOf(first.raw);
    return { ...resolved, markdown: resolved.markdown.slice(0, start) + resolved.markdown.slice(start + first.raw.length) };
}
export function renderWorkMarkdown(content: WorkDocumentView['content'], includeSources = true, title?: string): string {
    content = reportPresentation(content, title);
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
                const groupId = /^dory:\/\/evidence-group\/([a-zA-Z0-9_-]+)$/.exec(href)?.[1];
                if (groupId) {
                    const group = content.evidenceGroups?.find(item => item.id === groupId);
                    return includeSources && group
                        ? `<a href="#evidence-group-${escapeHtml(groupId)}" data-evidence-group="${escapeHtml(groupId)}">${label} · ${group.references.length}</a>`
                        : '';
                }
                const id = /^dory:\/\/evidence\/([a-zA-Z0-9_-]+)$/.exec(href)?.[1];
                if (id) return includeSources ? `<a href="#evidence-${escapeHtml(id)}" data-evidence="${escapeHtml(id)}">${label}</a>` : label;
                return /^(https?:\/\/|mailto:|#)/i.test(href) ? `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${label}</a>` : label;
            },
        },
    });
    return parser.parse(content.markdown, { async: false });
}
export const workPrintStyles = `:root{--chart-1:oklch(80.9% .105 251.813);--chart-2:oklch(62.3% .214 259.815);--chart-3:oklch(54.6% .245 262.881);--chart-4:oklch(48.8% .243 264.376);--chart-5:oklch(42.4% .199 265.638)}body{font:16px/1.6 system-ui,sans-serif;color:#171717;background:white;max-width:960px;margin:40px auto;padding:24px}h1{line-height:1.2}h2{font-size:22px;margin-top:32px}.source,header p{font-size:12px;color:#666}.metric{font-size:36px;display:block}.report-metrics{display:flex;flex-wrap:wrap;gap:24px}figure{margin:32px 0}figcaption{font-weight:600}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;overflow-wrap:anywhere}svg{max-height:400px;width:100%;color:#333}svg[data-multiple-series]{max-height:none}blockquote{border-left:3px solid #888;margin-left:0;padding-left:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:inherit}@media print{body{margin:0;padding:0}svg,tr{break-inside:avoid}h1,h2,h3,h4,figcaption{break-after:avoid}figure[data-visual-type="chart"],figure[data-visual-type="metric"],li{break-inside:avoid}thead{display:table-header-group}@page{margin:18mm}}`;
export function renderWorkHtml(document: WorkDocumentView): string {
    const sources = document.content.evidence
        .map(
            item =>
                `<li id="evidence-${escapeHtml(item.artifactId)}">${escapeHtml(item.connectionName ?? item.attachmentSource?.files.map(file => file.filename).join(', ') ?? item.connectionId ?? '')} · ${escapeHtml(item.title)} · ${escapeHtml(item.capturedAt)}</li>`,
        )
        .join('');
    // Export references resolve within the document; SQL is intentionally absent.
    const groups = (document.content.evidenceGroups ?? [])
        .map(
            group =>
                `<li id="evidence-group-${escapeHtml(group.id)}">${group.references.map(reference => `<a href="#evidence-${escapeHtml(reference.artifactId)}">${escapeHtml(document.content.evidence.find(item => item.artifactId === reference.artifactId)?.title ?? reference.artifactId)}</a>${reference.explanation ? `: ${escapeHtml(reference.explanation)}` : ''}`).join('; ')}</li>`,
        )
        .join('');
    const body = renderWorkMarkdown(document.content, true, document.title).replace(/href="dory:\/\/evidence\/([^"<>]+)"/g, 'href="#evidence-$1"');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(document.title)}</title><style>${workPrintStyles}</style></head><body><header><h1>${escapeHtml(document.title)}</h1><p>v${document.version ?? document.revision} · ${escapeHtml(document.updatedAt)}</p></header>${body}<footer><h2>Sources / 来源</h2><ul>${groups}${sources}</ul></footer></body></html>`;
}

/** Portable chart projection computed from the full immutable ResultSet at Apply time. */
function workspaceChartSvg(visual: WorkVisual): string {
    const spec = visual.chartSpec!;
    const projection = visual.chartData;
    if (!projection) throw new Error('The saved chart projection is unavailable. Reapply the chart before exporting.');
    const palette = (CHART_COLOR_PRESETS.find(preset => preset.value === spec.chartColorPreset) ?? CHART_COLOR_PRESETS[0]).colors.light;
    const color = (index: number) => palette[index % palette.length];
    const data = projection.data;
    const series = projection.series;
    const values = data.flatMap(row => series.map(item => Number(row[item.key])).filter(Number.isFinite));
    const low = Math.min(0, ...values),
        high = Math.max(0, ...values);
    const y = (value: number) => 260 - ((value - low) / (high - low || 1)) * 220;
    const step = 560 / Math.max(1, data.length);
    const x = (index: number) => 65 + (index + 0.5) * step;
    let shapes = '';
    if (spec.chartType === 'pie') {
        const points = data
            .map(row => ({ label: String(row.xLabel ?? ''), value: series.reduce((sum, item) => sum + (Number(row[item.key]) || 0), 0) }))
            .filter(item => item.value > 0);
        const total = points.reduce((sum, point) => sum + point.value, 0);
        let angle = -Math.PI / 2;
        shapes = points
            .map((point, index) => {
                const next = angle + (point.value / total) * Math.PI * 2;
                const start = [200 + 100 * Math.cos(angle), 150 + 100 * Math.sin(angle)];
                const end = [200 + 100 * Math.cos(next), 150 + 100 * Math.sin(next)];
                angle = next;
                const hint = `<title>${escapeHtml(point.label)}: ${point.value}</title>`;
                return (
                    (point.value === total
                        ? `<circle cx="200" cy="150" r="100" fill="${color(index)}">${hint}</circle>`
                        : `<path d="M200,150 L${start.join(',')} A100,100 0 ${point.value / total > 0.5 ? 1 : 0},1 ${end.join(',')} Z" fill="${color(index)}">${hint}</path>`) +
                    `<text x="330" y="${35 + index * 18}" fill="${color(index)}" font-size="11">${escapeHtml(point.label)}: ${point.value}</text>`
                );
            })
            .join('');
    } else if (spec.chartType === 'heatmap') {
        shapes = data
            .flatMap((row, i) =>
                series.map((item, j) => {
                    const value = Number(row[item.key]);
                    if (row[item.key] == null || !Number.isFinite(value)) return '';
                    const height = 220 / Math.max(1, series.length);
                    return `<rect x="${65 + i * step}" y="${35 + j * height}" width="${Math.max(1, step - 1)}" height="${Math.max(1, height - 1)}" fill="${color(0)}" opacity="${0.15 + 0.85 * (Number.isFinite(value) ? (value - low) / (high - low || 1) : 0)}"><title>${escapeHtml(row.xLabel)} / ${escapeHtml(item.label)}: ${value}</title></rect>`;
                }),
            )
            .join('');
    } else {
        shapes = series
            .map((item, j) => {
                const points = data.map((row, index) => ({ index, value: row[item.key] == null ? NaN : Number(row[item.key]), label: String(row.xLabel ?? index) }));
                if (spec.chartType === 'line') {
                    const path = points
                        .map((point, index) =>
                            Number.isFinite(point.value) ? `${index === 0 || !Number.isFinite(points[index - 1].value) ? 'M' : 'L'}${x(point.index)},${y(point.value)}` : '',
                        )
                        .join(' ');
                    return `<path d="${path}" fill="none" stroke="${color(j)}" stroke-width="2"><title>${escapeHtml(item.label)}</title></path>`;
                }
                return points
                    .filter(point => Number.isFinite(point.value))
                    .map(point => {
                        const hint = `<title>${escapeHtml(point.label)} / ${escapeHtml(item.label)}: ${point.value}</title>`;
                        if (spec.chartType === 'scatter') return `<circle cx="${x(point.index)}" cy="${y(point.value)}" r="3" fill="${color(j)}">${hint}</circle>`;
                        const width = (step * 0.8) / Math.max(1, series.length);
                        return `<rect x="${x(point.index) - step * 0.4 + j * width}" y="${Math.min(y(0), y(point.value))}" width="${width}" height="${Math.max(1, Math.abs(y(point.value) - y(0)))}" fill="${color(j)}">${hint}</rect>`;
                    })
                    .join('');
            })
            .join('');
    }
    const labels =
        spec.chartType === 'pie'
            ? ''
            : data
                  .map((row, index) =>
                      index % Math.max(1, Math.ceil(data.length / 8)) === 0
                          ? `<text x="${x(index)}" y="280" text-anchor="middle" font-size="10" fill="currentColor">${escapeHtml(String(row.xLabel ?? '').slice(0, 24))}</text>`
                          : '',
                  )
                  .join('');
    const legend = series.map((item, index) => `<text x="${65 + index * 140}" y="310" font-size="11" fill="${color(index)}">${escapeHtml(item.label)}</text>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 ${Math.max(330, spec.chartType === 'pie' ? 60 + data.length * 18 : 330)}" role="img" aria-label="${escapeHtml(visual.title)}" data-chart-type="${spec.chartType}">${shapes}${labels}${legend}</svg>`;
}
