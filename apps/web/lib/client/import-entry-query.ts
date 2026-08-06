import { createSerializer, parseAsBoolean, parseAsString } from 'nuqs';

export const importEntryParsers = {
    connection: parseAsString,
    database: parseAsString,
    schema: parseAsString,
    table: parseAsString,
};

export const serializeImportEntry = createSerializer(importEntryParsers);

export const tableImportParsers = {
    importOpen: parseAsBoolean.withDefault(false),
    importDatabase: parseAsString,
    importSchema: parseAsString,
    importTable: parseAsString,
    importRun: parseAsString,
};
