export type TablePropertiesRow = {
    engine?: string | null;
    comment?: string | null;
    primaryKey?: string | null;
    sortingKey?: string | null;
    partitionKey?: string | null;
    samplingKey?: string | null;
    storagePolicy?: string | null;
    totalRows?: number | null;
    totalBytes?: number | null;
};

export type TablePartitionStat = {
    name: string;
    rowCount: number;
    compressedBytes: number;
    uncompressedBytes: number;
};

export type TableMutationInfo = {
    id: string;
    command?: string | null;
    progress?: number | null;
    partsToDo?: number | null;
    partsDone?: number | null;
    createTime?: string | null;
};

export type PostgresIndexUsageStat = {
    indexName: string;
    indexScans: number;
    tupleReads: number;
    tupleFetches: number;
    sizeBytes: number | null;
};

export type PostgresVacuumHealth = {
    lastVacuum: string | null;
    lastAutovacuum: string | null;
    lastAnalyze: string | null;
    lastAutoanalyze: string | null;
    deadTuples: number | null;
    liveTuples: number | null;
    modsSinceAnalyze: number | null;
};

export type TableStats = {
    rowCount?: number | null;
    compressedBytes?: number | null;
    uncompressedBytes?: number | null;
    compressionRatio?: number | null;
    partitionCount: number;
    partitions: TablePartitionStat[];
    partCount: number;
    avgPartSize?: number | null;
    maxPartSize?: number | null;
    activeMutations: TableMutationInfo[];
    ttlExpression?: string | null;
    // postgres-specific optional fields
    totalBytes?: number | null;
    rowEstimate?: number | null;
    indexUsage?: PostgresIndexUsageStat[];
    vacuumHealth?: PostgresVacuumHealth | null;
};

export type TableIndexInfo = {
    name: string;
    method?: string | null;
    isPrimary?: boolean | null;
    isUnique?: boolean | null;
    sizeBytes?: number | null;
    definition?: string | null;
};

export type PostgresTableStats = {
    totalBytes: number | null;
    rowEstimate: number | null;
    indexUsage: PostgresIndexUsageStat[];
    vacuumHealth: PostgresVacuumHealth | null;
};
