export type OutputFormat =
  | { kind: 'text' }
  | { kind: 'json'; schemaHint?: string; strict?: boolean };

export type SystemSpec = {
  /**
   * Persona/task identity, e.g. SQL assistant, title generator, JSON generator
   */
  persona?: string;

  /**
   * Output format constraints (strongly recommended for all roles)
   */
  output: OutputFormat;

  /**
   * Rule list (one per line for diff/reuse)
   */
  rules?: string[];

  /**
   * Optional: language preference (use to enforce Chinese, etc.)
   */
  language?: 'zh' | 'en' | 'auto';

  /**
   * Optional: extra notes (use sparingly)
   */
  notes?: string[];
};
