import { ConnectionDialect } from '@/types';
import { Locale } from '@/lib/i18n/routing';

export type ActionIntent = 'fix-sql-error' | 'optimize-performance' | 'rewrite-sql' | 'to-aggregation';

export type ActionContext = {
    organizationId?: string;
    userId?: string;
    connectionId?: string;
    dialect: ConnectionDialect;
    sql: string;
    database?: string;
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
