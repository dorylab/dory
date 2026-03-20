export type AiOverview = {
    summary: string;
    detail: string;
    highlights: { field: string; description: string }[];
    snippets: { title?: string | null; sql: string }[];
};

export type SemanticGroups = {
    metrics: string[];
    dimensions: string[];
    geo: string[];
    keys: string[];
    time: string[];
};
