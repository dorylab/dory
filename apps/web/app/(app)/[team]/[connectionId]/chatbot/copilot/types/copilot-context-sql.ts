export type CopilotContextSQL = {
  baseline: {
    database?: string | null;
    dialect?: 'clickhouse' | 'duckdb' | 'mysql' | 'postgres' | 'unknown';
  };

  draft: {
    editorText: string;
    selection?: { start: number; end: number } | null;

    inferred: {
      tables: Array<{
        database?: string | null;
        name: string;
        raw?: string;
      }>;
      database?: string | null;
      confidence: 'high' | 'mid' | 'low';
    };
  };
};
