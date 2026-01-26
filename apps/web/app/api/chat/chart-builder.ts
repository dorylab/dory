import { tool } from 'ai';
import { z } from 'zod';
import { translateApi } from '@/app/api/utils/i18n';
import { Locale } from '@/lib/i18n/routing';

type ChartType = 'bar' | 'line' | 'area' | 'pie';

type Row = Record<string, unknown>;

type ColumnStats = {
    key: string;
    nonNullCount: number;
    numericCount: number;
    stringCount: number;
    booleanCount: number;
    distinctValues: Set<string>;
    isTimeLikeName: boolean;
    isTimeLikeValue: boolean;
};

const MAX_ANALYSIS_ROWS = 200;

function createChartInputSchema(locale: Locale) {
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);

    return z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        chartType: z.enum(['bar', 'line', 'area', 'pie']),
        data: z
            .array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])))
            .min(1, t('Api.Chat.ChartBuilder.Errors.DataRequired')),
        xKey: z.string().optional(),
        yKeys: z
            .array(
                z.object({
                    key: z.string().min(1, t('Api.Chat.ChartBuilder.Errors.YKeyRequired')),
                    label: z.string().optional(),
                    color: z.string().optional(),
                }),
            )
            .optional(),
        categoryKey: z.string().optional(),
        valueKey: z.string().optional(),
        options: z
            .object({
                stacked: z.boolean().optional(),
                xKeyType: z.enum(['time', 'category', 'number']).optional(),
                sortBy: z.enum(['x', 'value']).optional(),
            })
            .optional(),
    });
}

export function createChartBuilderTool(locale: Locale) {
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    const chartInputSchema = createChartInputSchema(locale);

    return tool({
        description: t('Api.Chat.ChartBuilder.Description'),
        inputSchema: chartInputSchema,
        execute: async input => {
        const rawData = Array.isArray(input.data) ? input.data : [];
        if (rawData.length === 0) {
            return {
                type: 'chart',
                ...input,
            };
        }

        
        const data: Row[] = rawData.map(row => ({ ...row }));

        
        const statsMap = analyzeColumns(data);
        const statsList = Object.values(statsMap);

        let { chartType, xKey: providedXKey, yKeys: providedYKeys, categoryKey: providedCategoryKey, valueKey: providedValueKey } = input;

        let xKey = providedXKey;
        let yKeys = providedYKeys ? [...providedYKeys] : undefined;
        let categoryKey = providedCategoryKey;
        let valueKey = providedValueKey;

        
        const timeColumns = statsList.filter(s => s.isTimeLikeName || s.isTimeLikeValue);
        const numericColumns = statsList.filter(s => s.numericCount > 0);
        const categoryColumns = statsList.filter(s => {
            const distinct = s.distinctValues.size;
            
            return s.stringCount > 0 && distinct >= 2 && distinct <= 50;
        });

        
        if (chartType === 'pie') {
            
            
            if (!categoryKey) {
                const categoryFromCategoryCols = categoryColumns[0]?.key;
                const categoryFromAnyStringCol = statsList.find(s => s.stringCount > 0)?.key;
                categoryKey = categoryFromCategoryCols || categoryFromAnyStringCol || statsList[0]?.key;
            }

            
            if (!valueKey) {
                const notCategoryNumeric = numericColumns.find(s => s.key !== categoryKey)?.key;
                valueKey = notCategoryNumeric || numericColumns[0]?.key || statsList.find(s => s.key !== categoryKey)?.key || statsList[1]?.key;
            }

            
            if (!yKeys || yKeys.length === 0) {
                if (valueKey) {
                    yKeys = [
                        {
                            key: valueKey,
                            label: toLabel(valueKey),
                        },
                    ];
                }
            }
        } else {
            
            
            if (!xKey) {
                const xFromTime = timeColumns[0]?.key;
                const xFromCategory = categoryColumns[0]?.key;
                xKey = xFromTime || xFromCategory || statsList[0]?.key;
            }

            
            if (!yKeys || yKeys.length === 0) {
                const metricCandidates = numericColumns.filter(s => s.key !== xKey);
                const chosen = metricCandidates.length > 0 ? metricCandidates : statsList.filter(s => s.key !== xKey);

                yKeys = chosen.slice(0, 3).map(s => ({
                    key: s.key,
                    label: toLabel(s.key),
                }));
            } else {
                
                yKeys = yKeys.map(y => ({
                    ...y,
                    label: y.label || toLabel(y.key),
                }));
            }
        }

        
        const options = { ...(input.options || {}) };
        let xKeyType: 'time' | 'category' | 'number' | undefined;
        let sortBy: 'x' | 'value' | undefined;

        if (xKey) {
            const xStats = statsMap[xKey];
            if (xStats) {
                if (xStats.isTimeLikeName || xStats.isTimeLikeValue) {
                    xKeyType = 'time';
                } else if (xStats.numericCount > 0 && xStats.stringCount === 0) {
                    xKeyType = 'number';
                } else {
                    xKeyType = 'category';
                }
            }

            
            if (xKeyType === 'time') {
                data.sort((a, b) => compareAsDate(a[xKey!], b[xKey!]));
                sortBy = 'x';
            } else if (xKeyType === 'number') {
                data.sort((a, b) => compareAsNumber(a[xKey!], b[xKey!]));
                sortBy = 'x';
            }
        }

        
        if (!sortBy && (chartType === 'pie' || chartType === 'bar')) {
            const mainValueKey = valueKey || yKeys?.[0]?.key;
            if (mainValueKey) {
                data.sort((a, b) => compareAsNumber(b[mainValueKey], a[mainValueKey]));
                sortBy = 'value';
            }
        }

        
        if (options.stacked === undefined) {
            if ((chartType === 'bar' || chartType === 'area') && yKeys && yKeys.length > 1) {
                options.stacked = true;
            }
        }

        if (xKeyType && !options.xKeyType) {
            options.xKeyType = xKeyType;
        }
        if (sortBy && !options.sortBy) {
            options.sortBy = sortBy;
        }

        return {
            type: 'chart',
            ...input,
            data,
            xKey,
            yKeys,
            valueKey,
            categoryKey,
            options,
        };
        },
    });
}

function analyzeColumns(data: Row[]): Record<string, ColumnStats> {
    const statsMap: Record<string, ColumnStats> = {};
    const sampleSize = Math.min(MAX_ANALYSIS_ROWS, data.length);

    for (let i = 0; i < sampleSize; i++) {
        const row = data[i];
        if (!row || typeof row !== 'object') continue;

        for (const [key, rawValue] of Object.entries(row)) {
            if (!statsMap[key]) {
                statsMap[key] = {
                    key,
                    nonNullCount: 0,
                    numericCount: 0,
                    stringCount: 0,
                    booleanCount: 0,
                    distinctValues: new Set<string>(),
                    isTimeLikeName: isTimeLikeFieldName(key),
                    isTimeLikeValue: false,
                };
            }

            const stats = statsMap[key];
            const value = rawValue as unknown;

            if (value === null || value === undefined) continue;
            stats.nonNullCount++;

            if (typeof value === 'number') {
                stats.numericCount++;
                
            } else if (typeof value === 'boolean') {
                stats.booleanCount++;
            } else if (typeof value === 'string') {
                stats.stringCount++;
                const trimmed = value.trim();
                if (trimmed) {
                    stats.distinctValues.add(trimmed);
                    if (!stats.isTimeLikeValue && isProbablyDateString(trimmed)) {
                        stats.isTimeLikeValue = true;
                    }
                }
            }
        }
    }

    return statsMap;
}

function isTimeLikeFieldName(name: string): boolean {
    const lower = name.toLowerCase();
    return /(time|date|ts|_at|timestamp)$/.test(lower);
}

function isProbablyDateString(value: string): boolean {
    
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return true;
    const ts = Date.parse(value);
    return Number.isFinite(ts);
}


function compareAsNumber(a: unknown, b: unknown): number {
    const na = toNumber(a);
    const nb = toNumber(b);
    if (na === null && nb === null) return 0;
    if (na === null) return 1;
    if (nb === null) return -1;
    return na - nb;
}

function compareAsDate(a: unknown, b: unknown): number {
    const da = toDate(a);
    const db = toDate(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.getTime() - db.getTime();
}

function toNumber(v: unknown): number | null {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function toDate(v: unknown): Date | null {
    if (v instanceof Date) return v;
    if (typeof v === 'string' || typeof v === 'number') {
        const d = new Date(v);
        return Number.isFinite(d.getTime()) ? d : null;
    }
    return null;
}

function toLabel(key: string): string {
    
    const replaced = key.replace(/[_\-]+/g, ' ');
    const parts = replaced.split(/\s+/).filter(Boolean);
    if (!parts.length) return key;
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}
