import type { PostgresDBClient } from '@/types';

/* -------------------- DbExecutor: for injecting tx in transactions -------------------- */
export type DbExecutor = Pick<PostgresDBClient, 'select' | 'insert' | 'update'>;
