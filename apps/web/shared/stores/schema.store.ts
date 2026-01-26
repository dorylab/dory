import { atom } from 'jotai';

export interface TableSchema {
  name: string;
  columns: string[];
}

export interface DatabaseSchema {
  name: string;
  tables: TableSchema[];
}

export type SchemaCache = Record<string, { databases: DatabaseSchema[] }>;

export const schemaCacheAtom = atom<SchemaCache>({});
