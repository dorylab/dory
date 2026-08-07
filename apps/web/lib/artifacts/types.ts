export type ArtifactType = 'result_set' | 'chart' | 'file';
export type ArtifactStatus = 'ready' | 'unavailable';

export type ArtifactChartState = {
    chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' | 'heatmap';
    xKey: string;
    yKey: string;
    groupKey: string;
    chartColorPreset?: 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';
};

type ArtifactSummaryBase = {
    id: string;
    title: string;
    status: ArtifactStatus;
    resourceId: string;
    parentArtifactId: string | null;
    sourceResultSetId: string | null;
    connectionId: string | null;
    connectionName: string | null;
    workId: string | null;
    agentRunId: string | null;
    runTitle: string | null;
    comparisonId: string | null;
    comparisonName: string | null;
    sourceType: string | null;
    createdByActorType: string;
    createdByActorId: string | null;
    rowCount: number | null;
    byteSize: number | null;
    fileName: string | null;
    fileFormat: 'csv' | 'parquet' | null;
    createdAt: string;
    updatedAt: string;
    expiresAt: string | null;
};

export type ArtifactSummary = ArtifactSummaryBase & {
    type: ArtifactType;
};

type ResultSetContext = {
    resultSet: {
        id: string;
        columns: unknown[];
        dataAvailability: string;
        sql: string | null;
        previewRowCount: number;
    } | null;
};

export type ResultSetArtifactDetail = ArtifactSummaryBase &
    ResultSetContext & {
        type: 'result_set';
        chartState: null;
        downloadUrl: null;
    };

export type ChartArtifactDetail = ArtifactSummaryBase &
    ResultSetContext & {
        type: 'chart';
        chartState: ArtifactChartState | null;
        downloadUrl: null;
    };

export type FileArtifactDetail = ArtifactSummaryBase &
    ResultSetContext & {
        type: 'file';
        chartState: null;
        downloadUrl: string | null;
    };

export type ArtifactDetail = ResultSetArtifactDetail | ChartArtifactDetail | FileArtifactDetail;
