import type { PostgresDBClient } from '@dory/shared';

/* -------------------- DbExecutor: for injecting tx in transactions -------------------- */
export type DbExecutor = Pick<PostgresDBClient, 'select' | 'insert' | 'update'>;
