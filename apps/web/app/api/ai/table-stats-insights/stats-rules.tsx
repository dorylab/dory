// lib/ai/stats-rules.ts
import type { TableStats } from '@/types/table-info';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';


export type TableIssueLevel = 'info' | 'warn' | 'critical';


export type TableIssueCode =
    
    | 'ROWCOUNT_UNKNOWN'
    | 'ROWCOUNT_SMALL'
    | 'ROWCOUNT_MEDIUM'
    | 'ROWCOUNT_LARGE'
    | 'ROWCOUNT_HUGE'
    | 'TOTAL_SIZE_LARGE'
    | 'TOTAL_SIZE_HUGE'
    
    | 'PARTITION_TOO_FEW_FOR_LARGE_TABLE'
    | 'PARTITION_TOO_MANY'
    | 'PARTITION_SKEWED'
    
    | 'PARTS_TOO_MANY'
    | 'PARTS_MANY_FOR_SMALL_TABLE'
    | 'PARTS_TOO_FEW_FOR_LARGE_TABLE'
    | 'PART_SIZE_TOO_SMALL'
    | 'PART_SIZE_TOO_LARGE'
    | 'PART_FRAGMENTED'
    
    | 'COMPRESSION_UNKNOWN'
    | 'COMPRESSION_EXCELLENT'
    | 'COMPRESSION_GOOD'
    | 'COMPRESSION_POOR'
    | 'COMPRESSION_INCONSISTENT'
    
    | 'TTL_MISSING_FOR_LARGE_TABLE'
    | 'TTL_CONFIGURED'
    
    | 'ACTIVE_MUTATIONS'
    | 'TOO_MANY_ACTIVE_MUTATIONS'
    
    | 'STATS_INCONSISTENT';


export type TableIssue = {
    code: TableIssueCode;
    level: TableIssueLevel;
    message: string;   
    detail?: string;   
};


function toNumberOrNull(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function bytesToGB(bytes: number | null): number | null {
    if (bytes == null) return null;
    return bytes / (1024 * 1024 * 1024);
}


export async function analyzeTableStats(stats: TableStats): Promise<TableIssue[]> {
    const locale = await getApiLocale();
    const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
    const issues: TableIssue[] = [];

    const rowCount = toNumberOrNull(stats.rowCount);
    const compressionRatio = toNumberOrNull(stats.compressionRatio);
    const compressedBytes = toNumberOrNull(stats.compressedBytes);
    const uncompressedBytes = toNumberOrNull(stats.uncompressedBytes);
    const partitionCount = toNumberOrNull(stats.partitionCount);
    const partCount = toNumberOrNull(stats.partCount);
    const avgPartSize = toNumberOrNull(stats.avgPartSize);
    const maxPartSize = toNumberOrNull(stats.maxPartSize);
    const activeMutations = stats.activeMutations ?? [];
    const ttlExpression = stats.ttlExpression ?? null;
    const partitions = stats.partitions ?? [];

    

    if (rowCount == null) {
        issues.push({
            code: 'ROWCOUNT_UNKNOWN',
            level: 'info',
            message: await t('Api.Ai.TableStats.Issues.RowCountUnknown'),
            detail: await t('Api.Ai.TableStats.Details.RowCountMissing'),
        });
    } else {
        if (rowCount < 1_000_000) {
            issues.push({
                code: 'ROWCOUNT_SMALL',
                level: 'info',
                message: t('Api.Ai.TableStats.Issues.RowCountSmall'),
                detail: t('Api.Ai.TableStats.Details.RowCount', { rowCount }),
            });
        } else if (rowCount <= 100_000_000) {
            issues.push({
                code: 'ROWCOUNT_MEDIUM',
                level: 'info',
                message: t('Api.Ai.TableStats.Issues.RowCountMedium'),
                detail: t('Api.Ai.TableStats.Details.RowCount', { rowCount }),
            });
        } else if (rowCount <= 1_000_000_000) {
            issues.push({
                code: 'ROWCOUNT_LARGE',
                level: 'warn',
                message: t('Api.Ai.TableStats.Issues.RowCountLarge'),
                detail: t('Api.Ai.TableStats.Details.RowCount', { rowCount }),
            });
        } else {
            issues.push({
                code: 'ROWCOUNT_HUGE',
                level: 'critical',
                message: t('Api.Ai.TableStats.Issues.RowCountHuge'),
                detail: t('Api.Ai.TableStats.Details.RowCount', { rowCount }),
            });
        }
    }

    const sizeGB = bytesToGB(compressedBytes);
    if (sizeGB != null) {
        if (sizeGB > 50 && sizeGB <= 200) {
            issues.push({
                code: 'TOTAL_SIZE_LARGE',
                level: 'warn',
                message: t('Api.Ai.TableStats.Issues.TotalSizeLarge'),
                detail: t('Api.Ai.TableStats.Details.CompressedSize', { size: sizeGB.toFixed(2) }),
            });
        } else if (sizeGB > 200) {
            issues.push({
                code: 'TOTAL_SIZE_HUGE',
                level: 'critical',
                message: t('Api.Ai.TableStats.Issues.TotalSizeHuge'),
                detail: t('Api.Ai.TableStats.Details.CompressedSize', { size: sizeGB.toFixed(2) }),
            });
        }
    }

    

    if (rowCount != null && rowCount > 10_000_000) {
        const pc = partitionCount ?? partitions.length;
        if (pc <= 1) {
            issues.push({
                code: 'PARTITION_TOO_FEW_FOR_LARGE_TABLE',
                level: 'critical',
                message: t('Api.Ai.TableStats.Issues.PartitionTooFew'),
                detail: t('Api.Ai.TableStats.Details.PartitionCount', { rowCount, partitionCount: pc }),
            });
        }
    }

    if (partitionCount != null && partitionCount > 200) {
        issues.push({
            code: 'PARTITION_TOO_MANY',
            level: 'warn',
            message: t('Api.Ai.TableStats.Issues.PartitionTooMany'),
            detail: t('Api.Ai.TableStats.Details.PartitionOnlyCount', { partitionCount }),
        });
    }

    
    if (rowCount && partitions.length > 0) {
        const totalRows = partitions.reduce((sum, p: any) => sum + (toNumberOrNull(p.rowCount) ?? 0), 0);
        if (totalRows > 0) {
            const maxPartitionRows = Math.max(
                ...partitions.map(p => toNumberOrNull(p.rowCount) ?? 0),
            );
            const ratio = maxPartitionRows / totalRows;
            if (ratio > 0.5) {
                issues.push({
                    code: 'PARTITION_SKEWED',
                    level: 'warn',
                    message: t('Api.Ai.TableStats.Issues.PartitionSkewed'),
                    detail: t('Api.Ai.TableStats.Details.MaxPartitionRatio', { ratio: (ratio * 100).toFixed(1) }),
                });
            }
        }
    }

    

    if (partCount != null) {
        if (partCount > 1_000 && partCount <= 10_000) {
            issues.push({
                code: 'PARTS_TOO_MANY',
                level: 'warn',
                message: t('Api.Ai.TableStats.Issues.PartsTooMany'),
                detail: t('Api.Ai.TableStats.Details.PartCount', { partCount }),
            });
        } else if (partCount > 10_000) {
            issues.push({
                code: 'PARTS_TOO_MANY',
                level: 'critical',
                message: t('Api.Ai.TableStats.Issues.PartsTooManyCritical'),
                detail: t('Api.Ai.TableStats.Details.PartCount', { partCount }),
            });
        }
    }

    if (partCount != null && rowCount != null && rowCount < 1_000_000 && partCount > 1_000) {
        issues.push({
            code: 'PARTS_MANY_FOR_SMALL_TABLE',
            level: 'warn',
            message: t('Api.Ai.TableStats.Issues.PartsManySmallTable'),
            detail: t('Api.Ai.TableStats.Details.RowPartCount', { rowCount, partCount }),
        });
    }

    if (partCount != null && rowCount != null && rowCount > 100_000_000 && partCount < 50) {
        issues.push({
            code: 'PARTS_TOO_FEW_FOR_LARGE_TABLE',
            level: 'info',
            message: t('Api.Ai.TableStats.Issues.PartsFewLargeTable'),
            detail: t('Api.Ai.TableStats.Details.RowPartCount', { rowCount, partCount }),
        });
    }

    
    const avgSizeGB = bytesToGB(avgPartSize);
    const maxSizeGB = bytesToGB(maxPartSize);

    if (avgSizeGB != null && avgSizeGB < 0.01 && partCount != null && partCount > 1000) {
        issues.push({
            code: 'PART_SIZE_TOO_SMALL',
            level: 'warn',
            message: t('Api.Ai.TableStats.Issues.PartSizeTooSmall'),
            detail: t('Api.Ai.TableStats.Details.PartSizeSmall', {
                avgSize: (avgSizeGB * 1024).toFixed(1),
                partCount,
            }),
        });
    }

    if (maxSizeGB != null && maxSizeGB > 5) {
        issues.push({
            code: 'PART_SIZE_TOO_LARGE',
            level: 'warn',
            message: t('Api.Ai.TableStats.Issues.PartSizeTooLarge'),
            detail: t('Api.Ai.TableStats.Details.PartMaxSize', { maxSize: maxSizeGB.toFixed(2) }),
        });
    }

    if (avgSizeGB != null && maxSizeGB != null && maxSizeGB > avgSizeGB * 10 && partCount != null && partCount > 100) {
        issues.push({
            code: 'PART_FRAGMENTED',
            level: 'info',
            message: t('Api.Ai.TableStats.Issues.PartFragmented'),
            detail: t('Api.Ai.TableStats.Details.PartSizeRatio', { ratio: (maxSizeGB / avgSizeGB).toFixed(1) }),
        });
    }

    

    if (compressionRatio == null) {
        issues.push({
            code: 'COMPRESSION_UNKNOWN',
            level: 'info',
            message: t('Api.Ai.TableStats.Issues.CompressionUnknown'),
        });
    } else {
        if (compressionRatio < 0.4) {
            issues.push({
                code: 'COMPRESSION_EXCELLENT',
                level: 'info',
                message: t('Api.Ai.TableStats.Issues.CompressionExcellent'),
                detail: t('Api.Ai.TableStats.Details.CompressionRatio', { ratio: compressionRatio.toFixed(3) }),
            });
        } else if (compressionRatio <= 0.8) {
            issues.push({
                code: 'COMPRESSION_GOOD',
                level: 'info',
                message: t('Api.Ai.TableStats.Issues.CompressionGood'),
                detail: t('Api.Ai.TableStats.Details.CompressionRatio', { ratio: compressionRatio.toFixed(3) }),
            });
        } else {
            issues.push({
                code: 'COMPRESSION_POOR',
                level: 'warn',
                message: t('Api.Ai.TableStats.Issues.CompressionPoor'),
                detail: t('Api.Ai.TableStats.Details.CompressionRatio', { ratio: compressionRatio.toFixed(3) }),
            });
        }
    }

    if (compressedBytes != null && uncompressedBytes != null && compressedBytes > uncompressedBytes) {
        issues.push({
            code: 'COMPRESSION_INCONSISTENT',
            level: 'warn',
            message: t('Api.Ai.TableStats.Issues.CompressionInconsistent'),
            detail: t('Api.Ai.TableStats.Details.CompressionBytes', { compressedBytes, uncompressedBytes }),
        });
    }

    

    if (ttlExpression && ttlExpression.trim()) {
        issues.push({
            code: 'TTL_CONFIGURED',
            level: 'info',
            message: t('Api.Ai.TableStats.Issues.TtlConfigured'),
            detail: t('Api.Ai.TableStats.Details.TtlExpression', { ttl: ttlExpression }),
        });
    } else if (rowCount != null && rowCount > 100_000_000) {
        issues.push({
            code: 'TTL_MISSING_FOR_LARGE_TABLE',
            level: 'warn',
            message: t('Api.Ai.TableStats.Issues.TtlMissing'),
            detail: t('Api.Ai.TableStats.Details.RowCount', { rowCount }),
        });
    }

    

    const activeCount = activeMutations.length;

    if (activeCount > 0) {
        issues.push({
            code: 'ACTIVE_MUTATIONS',
            level: 'info',
            message: t('Api.Ai.TableStats.Issues.ActiveMutations', { count: activeCount }),
        });
    }

    if (activeCount > 10) {
        issues.push({
            code: 'TOO_MANY_ACTIVE_MUTATIONS',
            level: 'warn',
            message: t('Api.Ai.TableStats.Issues.TooManyActiveMutations'),
            detail: t('Api.Ai.TableStats.Details.ActiveMutations', { count: activeCount }),
        });
    }

    

    if (rowCount != null && rowCount < 0) {
        issues.push({
            code: 'STATS_INCONSISTENT',
            level: 'warn',
            message: t('Api.Ai.TableStats.Issues.StatsInconsistent'),
            detail: t('Api.Ai.TableStats.Details.RowCount', { rowCount }),
        });
    }

    if (compressedBytes != null && compressedBytes < 0) {
        issues.push({
            code: 'STATS_INCONSISTENT',
            level: 'warn',
            message: t('Api.Ai.TableStats.Issues.StatsInconsistent'),
            detail: t('Api.Ai.TableStats.Details.CompressedBytes', { compressedBytes }),
        });
    }

    if (uncompressedBytes != null && uncompressedBytes < 0) {
        issues.push({
            code: 'STATS_INCONSISTENT',
            level: 'warn',
            message: t('Api.Ai.TableStats.Issues.StatsInconsistent'),
            detail: t('Api.Ai.TableStats.Details.UncompressedBytes', { uncompressedBytes }),
        });
    }

    return issues;
}
