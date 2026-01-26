export const CHART_BUILDER_TOOL_DESCRIPTION = [
    'Return a chart configuration based on the provided data.',
    '',
    'Usage:',
    '1. Specify chartType (bar/line/area/pie).',
    '2. data is an array of query result rows.',
    '3. If you are unsure about xKey / yKeys / categoryKey / valueKey, leave them empty and the tool will infer:',
    '   - Line/area: prefer a time field for x, numeric fields for y.',
    '   - Bar: prefer a category field for x, numeric fields for y.',
    '   - Pie: choose one category field as categoryKey and one numeric field as valueKey.',
    '4. The tool infers time/numeric/category columns and sets options.xKeyType/sortBy when appropriate.',
].join('\n');
