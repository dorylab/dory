export type LocalFileSourceBackend = 'serverPath' | 'local' | 's3' | 'r2' | 'oss' | 'gcs';

export type LocalFileSourceType = 'excel' | 'csv' | 'parquet' | 'json';

export type LocalFileRelationMode = 'virtual' | 'cached' | 'materialized';

export type LocalFileSchemaDriftStatus = 'unknown' | 'none' | 'changed';

export type LocalFileRefreshStrategy = 'manual' | 'onChange' | 'scheduled';

export type LocalFileSourceDescriptor =
    | {
          backend: 'serverPath';
          filePath: string;
      }
    | {
          backend: Exclude<LocalFileSourceBackend, 'serverPath'>;
          key: string;
          bucket?: string;
      };

export type LocalFileSourceStat = {
    backend: LocalFileSourceBackend;
    path: string;
    sizeBytes: number;
    mtimeMs: number;
    sourceType: LocalFileSourceType;
};

export type LocalFileRelationManifest = {
    sourceType: LocalFileSourceType;
    source: LocalFileSourceDescriptor;
    duckdbPath: string;
    sheetName?: string;
    relationName: string;
    mode: LocalFileRelationMode;
    sourceFingerprint: string;
};

export type LocalFilesInspectRequest = {
    source: LocalFileSourceDescriptor;
};

export type LocalFilesInspectResponse = {
    source: LocalFileSourceStat;
    relations: LocalFileRelationManifest[];
};

export type LocalFilesCreateRequest = {
    name: string;
    schemaName?: string;
    source: LocalFileSourceDescriptor;
    relations: LocalFileRelationManifest[];
    mode?: LocalFileRelationMode;
};

export type LocalFilesRefreshRequest = {
    datasetId: string;
};

export type DatasetColumnSnapshot = {
    name: string;
    type: string;
    nullable: boolean | null;
    detectedSemantic: string | null;
    sampleValues: unknown[];
    summary: Record<string, unknown> | null;
};
