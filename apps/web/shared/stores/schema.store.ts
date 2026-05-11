import { atom } from 'jotai';
import type { ConnectionSchemaMap } from '@dory/drivers/types';

export interface TableSchema {
    name: string;
    columns: string[];
}

export type SchemaResponse = {
    ok?: boolean;
    schema?: ConnectionSchemaMap;
    error?: string;
};

export type SchemaCache = Record<string, SchemaResponse>;

export const schemaCacheAtom = atom<SchemaCache>({});
