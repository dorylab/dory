// chat/copilot/copilot-context-types.ts

import type { CopilotContextSQL } from './copilot-context-sql';

export type { CopilotContextSQL };


export type CopilotContextTable = {
    database?: string;

    table: {
        schema?: string;
        name: string; 
        selectedColumn?: string | null;

        rowCount?: number | null;
        engine?: string | null;
        partitionKey?: string | null;
        primaryKey?: string | null;
    };
};

export type CopilotContext = CopilotContextSQL | CopilotContextTable;
