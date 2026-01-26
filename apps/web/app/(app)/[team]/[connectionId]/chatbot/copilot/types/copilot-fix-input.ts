import { ConnectionDialect } from '@/types';
import type { CopilotEnvelopeMeta } from './copilot-envelope';

export type CopilotFixInput = {
    surface: 'sql';
    meta?: CopilotEnvelopeMeta;

    lastExecution: {
        occurredAt?: number;
        dialect?: ConnectionDialect;
        database?: string | null;

        sql: string;
        error?: {
            message: string;
            code?: string | number | null;
        } | null;
    };
};
