import { jsonSchema, type ToolSet } from 'ai';

type JsonSchema = Record<string, unknown>;

export type CloudToolDeclaration = {
    description?: string;
    title?: string;
    inputSchema: JsonSchema;
    outputSchema?: JsonSchema;
    strict?: boolean;
};

const DEFAULT_TOOL_OUTPUT_SCHEMA: JsonSchema = {
    type: 'object',
    additionalProperties: true,
};

export const SQL_RUNNER_INPUT_SCHEMA: JsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['sql'],
    properties: {
        sql: {
            type: 'string',
            minLength: 1,
        },
        database: {
            type: 'string',
        },
    },
};

export const CHART_BUILDER_INPUT_SCHEMA: JsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['chartType'],
    properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        chartType: {
            type: 'string',
            enum: ['bar', 'line', 'area', 'pie'],
        },
        xKey: { type: 'string' },
        yKeys: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['key'],
                properties: {
                    key: { type: 'string', minLength: 1 },
                    label: { type: 'string' },
                    color: { type: 'string' },
                },
            },
        },
        categoryKey: { type: 'string' },
        valueKey: { type: 'string' },
        options: {
            type: 'object',
            additionalProperties: false,
            properties: {
                stacked: { type: 'boolean' },
                xKeyType: { type: 'string', enum: ['time', 'category', 'number'] },
                sortBy: { type: 'string', enum: ['x', 'value'] },
            },
        },
    },
};

export function buildCloudToolDeclarations(options: {
    includeSqlRunner: boolean;
    includeChartBuilder?: boolean;
    sqlRunnerDescription?: string;
    chartBuilderDescription?: string;
}): Record<string, CloudToolDeclaration> {
    const declarations: Record<string, CloudToolDeclaration> = {};

    if (options.includeChartBuilder !== false) {
        declarations.chartBuilder = {
            description: options.chartBuilderDescription,
            inputSchema: CHART_BUILDER_INPUT_SCHEMA,
            outputSchema: DEFAULT_TOOL_OUTPUT_SCHEMA,
        };
    }

    if (options.includeSqlRunner) {
        declarations.sqlRunner = {
            description: options.sqlRunnerDescription,
            inputSchema: SQL_RUNNER_INPUT_SCHEMA,
            outputSchema: DEFAULT_TOOL_OUTPUT_SCHEMA,
        };
    }

    return declarations;
}

export function buildCloudToolSet(declarations?: Record<string, CloudToolDeclaration> | null): ToolSet {
    if (!declarations) return {};

    const tools: ToolSet = {};
    for (const [name, declaration] of Object.entries(declarations)) {
        tools[name] = {
            description: declaration.description,
            title: declaration.title,
            strict: declaration.strict,
            inputSchema: jsonSchema(declaration.inputSchema),
            outputSchema: jsonSchema(declaration.outputSchema ?? DEFAULT_TOOL_OUTPUT_SCHEMA),
        };
    }

    return tools;
}
