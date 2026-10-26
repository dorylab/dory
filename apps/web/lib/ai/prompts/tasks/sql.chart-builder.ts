export const CHART_BUILDER_TOOL_DESCRIPTION = [
    'Return a chart configuration based on the provided data.',
    '',
    'Usage:',
    '1. Specify chartType (bar/line/area/pie).',
    '2. Query first, or pass the artifactId returned by an earlier query. The tool reads the result rows; never provide a data array.',
    '3. If you are unsure about xKey / yKeys / categoryKey / valueKey, leave them empty and the tool will infer:',
    '   - Line/area: prefer a time field for x, numeric fields for y.',
    '   - Bar: prefer a category field for x, numeric fields for y.',
    '   - Pie: choose one category field as categoryKey and one numeric field as valueKey.',
    '4. The tool infers time/numeric/category columns and sets options.xKeyType/sortBy when appropriate.',
    '5. Insert the returned embed Markdown on its own line inside the final answer, between the relevant introduction and explanation. Use each embed once and never invent chart IDs.',
].join('\n');
