export const OSSIE_VERSION = '0.2.0.dev0' as const;
export type OssieVersion = typeof OSSIE_VERSION;

export const OSSIE_DIALECTS = [
    'ANSI_SQL',
    'SNOWFLAKE',
    'MDX',
    'TABLEAU',
    'DATABRICKS',
    'MAQL',
    'BIGQUERY',
    'SIGMA',
    'THOUGHTSPOT',
    'DAX',
    'HOLISTICS_AQL',
    'OSSIE_SQL_2026',
] as const;
export type OssieDialect = (typeof OSSIE_DIALECTS)[number];

export const OSSIE_DATA_TYPES = ['String', 'Integer', 'Decimal', 'Float', 'Boolean', 'Date', 'Time', 'DateTime', 'DateTimeTz', 'Opaque'] as const;
export type OssieDataType = (typeof OSSIE_DATA_TYPES)[number];

export function isOssieTimeField(field: { datatype?: OssieDataType; dimension?: { is_time?: boolean } }): boolean {
    return field.dimension?.is_time ?? (field.datatype !== undefined && ['Date', 'Time', 'DateTime', 'DateTimeTz'].includes(field.datatype));
}
