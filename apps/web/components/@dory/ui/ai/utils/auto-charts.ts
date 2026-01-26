import { ChartResultPart } from "../charts-result";
import { translate } from "@/lib/i18n/i18n";
import { getClientLocale } from "@/lib/i18n/client-locale";
import { SqlResultPart } from "../sql-result/type";

type AutoChartOptions = {
    title?: string;
    description?: string;
};

export function buildAutoChartFromSql(sqlResult: SqlResultPart, options?: AutoChartOptions): ChartResultPart | null {
    const rows = Array.isArray(sqlResult.previewRows) ? sqlResult.previewRows : [];
    if (!rows.length) return null;

    const columnNames = sqlResult.columns && sqlResult.columns.length > 0 ? sqlResult.columns.map(col => col.name).filter(Boolean) : Object.keys(rows[0] ?? {});

    if (!columnNames.length) return null;

    const numericColumns = columnNames.filter(name =>
        rows.some(row => {
            const value = (row as Record<string, unknown> | undefined)?.[name];
            return typeof value === 'number' || (typeof value === 'string' && value !== '' && !Number.isNaN(Number(value)));
        }),
    );

    let categoricalColumns = columnNames.filter(name =>
        rows.some(row => {
            const value = (row as Record<string, unknown> | undefined)?.[name];
            return typeof value === 'string';
        }),
    );

    const normalizedData = rows.map((row, index) => {
        const clone: Record<string, unknown> = { ...(row as Record<string, unknown>) };
        numericColumns.forEach(col => {
            const raw = clone[col];
            if (typeof raw === 'string') {
                const converted = Number(raw);
                clone[col] = Number.isFinite(converted) ? converted : null;
            }
        });
        clone.__index__ = (index + 1).toString();
        return clone;
    });

    if (!categoricalColumns.length) {
        categoricalColumns = ['__index__'];
    }

    if (!numericColumns.length) {
        return null;
    }

    const xKey = categoricalColumns[0];
    const yKeys = numericColumns.map(name => ({
        key: name,
        label: name,
    }));

    return {
        type: 'chart',
        chartType: yKeys.length > 1 ? 'line' : 'bar',
        title: options?.title ?? translate(getClientLocale(), 'DoryUI.SqlResult.AutoChart.Title'),
        description: options?.description ?? translate(getClientLocale(), 'DoryUI.SqlResult.AutoChart.Description'),
        data: normalizedData,
        xKey,
        yKeys,
    };
}
