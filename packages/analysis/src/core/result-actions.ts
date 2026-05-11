export type FilterAction = {
    type: 'filter';
    title: string;
    params: {
        column: string;
        operator: '>' | '<' | '=' | '>=' | '<=';
        value: number | string;
    };
};

export type GroupAction = {
    type: 'group';
    title: string;
    params: {
        dimensions: string[];
        measure?: {
            column: string;
            aggregation: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
        };
        limit?: number;
    };
};

export type TrendAction = {
    type: 'trend';
    title: string;
    params: {
        timeColumn: string;
        measure?: {
            column: string;
            aggregation: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
        };
        limit?: number;
    };
};

export type DistributionAction = {
    type: 'distribution';
    title: string;
    params: {
        column: string;
    };
};

export type ResultAction = FilterAction | GroupAction | TrendAction | DistributionAction;

function quoted(name: string) {
    return `"${name.replace(/"/g, '""')}"`;
}

function sourceQuery(baseSql: string) {
    const sql = baseSql.trim().replace(/;+\s*$/, '');
    if (!sql) {
        throw new Error('Action requires a source SQL statement.');
    }
    return `(\n${sql}\n) AS action_source`;
}

function literal(value: number | string) {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error('Action filter value must be finite.');
        return String(value);
    }
    return `'${value.replace(/'/g, "''")}'`;
}

function limitClause(limit?: number) {
    const value = typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : null;
    return value ? `\nLIMIT ${value}` : '';
}

export function actionToSql(action: ResultAction, baseSql: string) {
    const source = sourceQuery(baseSql);

    if (action.type === 'filter') {
        return `SELECT *
FROM ${source}
WHERE ${quoted(action.params.column)} ${action.params.operator} ${literal(action.params.value)}
LIMIT 200`;
    }

    if (action.type === 'group') {
        const dimensions = action.params.dimensions.filter(Boolean);
        if (!dimensions.length) {
            throw new Error('Group action requires at least one dimension.');
        }
        const dimensionSql = dimensions.map(quoted).join(', ');
        const dimensionIndexes = dimensions.map((_, index) => String(index + 1)).join(', ');
        const measure = action.params.measure;
        const measureSql = measure ? `${measure.aggregation}(${quoted(measure.column)}) AS value` : 'COUNT(*) AS total_rows';
        const orderColumn = measure ? 'value' : 'total_rows';

        return `SELECT ${dimensionSql},
       ${measureSql}
FROM ${source}
GROUP BY ${dimensionIndexes}
ORDER BY ${orderColumn} DESC${limitClause(action.params.limit ?? 20)}`;
    }

    if (action.type === 'trend') {
        const measure = action.params.measure;
        const measureSql = measure ? `${measure.aggregation}(${quoted(measure.column)}) AS value` : 'COUNT(*) AS total_rows';

        return `SELECT ${quoted(action.params.timeColumn)} AS bucket,
       ${measureSql}
FROM ${source}
GROUP BY 1
ORDER BY 1 ASC${limitClause(action.params.limit ?? 50)}`;
    }

    return `SELECT
    MIN(${quoted(action.params.column)}) AS min_value,
    AVG(${quoted(action.params.column)}) AS avg_value,
    MAX(${quoted(action.params.column)}) AS max_value,
    COUNT(*) AS total_rows
FROM ${source}`;
}
