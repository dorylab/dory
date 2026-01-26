import { ConnectionDialect } from '@/types';
import { Locale } from '@/lib/i18n/routing';

export type ActionIntent = 'fix-sql-error' | 'optimize-performance' | 'rewrite-sql' | 'to-aggregation';

export type ActionContext = {
    dialect: ConnectionDialect;
    sql: string;
    database?: string;
    locale?: Locale;
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
