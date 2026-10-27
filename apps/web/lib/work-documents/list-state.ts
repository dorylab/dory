import { createSerializer, parseAsBoolean, parseAsString, parseAsStringLiteral } from 'nuqs/server';

export const reportListParsers = {
    q: parseAsString.withDefault(''),
    connectionId: parseAsString.withDefault(''),
    archiveState: parseAsStringLiteral(['active', 'archived', 'all'] as const),
    archived: parseAsBoolean.withDefault(false),
};

export const serializeReportList = createSerializer(reportListParsers);
