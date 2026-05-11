import { ConnectionDialect } from '@dory/shared';
import { Locale } from '@dory/i18n/routing';

export type ActionIntent = 'fix-sql-error' | 'optimize-performance' | 'rewrite-sql' | 'to-aggregation';

export type ActionContext = {
    organizationId?: string;
    userId?: string;
    connectionId?: string;
    dialect: ConnectionDialect;
    sql: string;
    instruction?: string;
    database?: string;
    activeSchema?: string;
    candidateTables?: Array<{
        database?: string | null;
        schema?: string | null;
        name: string;
    }>;
    schemaContext?: string;
    locale?: Locale;
    model?: string | null;
    error?: {
        message: string;
        code?: string | number;
    };
};

export type ActionResult = {
    title: string;
    explanation: string;
    fixedSql: string;
    risk: 'low' | 'medium' | 'high';
};
