import { pgEnum } from 'drizzle-orm/pg-core';

export const datasourceTypeEnum = pgEnum('datasource_type', ['mysql', 'clickhouse', 'postgres', 'doris', 'sqlite', 'pglite']);

export const datasourceStatusEnum = pgEnum('datasource_status', ['draft', 'active', 'disabled']);
