import type { Comparison, ComparisonRun } from '@dory/database/postgres/schemas';
import type { SchemaComparisonResult } from '@dory/schema-compare';

type ClientDate = string | Date;

export type ComparisonRunClient = Omit<ComparisonRun, 'completedAt' | 'startedAt' | 'updatedAt'> & {
    startedAt: ClientDate;
    updatedAt: ClientDate;
    completedAt: ClientDate | null;
};

export type ComparisonClient = Omit<Comparison, 'createdAt' | 'updatedAt'> & {
    createdAt: ClientDate;
    updatedAt: ClientDate;
    latestRun: ComparisonRunClient | null;
    latestSuccessfulRun: ComparisonRunClient | null;
};

export type ComparisonMutationClient = {
    comparison: ComparisonClient;
    run: ComparisonRunClient | null;
    result: SchemaComparisonResult | null;
    topChanges: SchemaComparisonResult['changes'];
    configurationChanged?: boolean;
};
