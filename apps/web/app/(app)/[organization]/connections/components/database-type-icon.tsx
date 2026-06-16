'use client';

import Image from 'next/image';

import { cn } from '@dory/web-utils';

import type { ConnectionType } from '@dory/shared/types/connections';

type DatabaseTypeMeta = {
    src?: string;
    label: string;
};

export const DATABASE_TYPE_META: Partial<Record<ConnectionType, DatabaseTypeMeta>> = {
    clickhouse: { src: '/images/logos/clickhouse.svg', label: 'ClickHouse' },
    'cloudflare-d1': { src: '/images/logos/cloudflare.svg', label: 'Cloudflare D1' },
    doris: { src: '/images/logos/apache-doris.svg', label: 'Apache Doris' },
    duckdb: { src: '/images/logos/duckdb.svg', label: 'DuckDB' },
    mariadb: { src: '/images/logos/mariadb.svg', label: 'MariaDB' },
    mysql: { src: '/images/logos/mysql.svg', label: 'MySQL' },
    neon: { src: '/images/logos/neon.svg', label: 'Neon' },
    oracle: { label: 'Oracle' },
    postgres: { src: '/images/logos/postgresql.svg', label: 'PostgreSQL' },
    sqlite: { src: '/images/logos/sqlite.svg', label: 'SQLite' },
    sqlserver: { src: '/images/logos/sqlserver.svg', label: 'SQL Server' },
};

export function getDatabaseTypeMeta(type?: string | null) {
    const normalizedType = (type ?? '').trim().toLowerCase();
    const meta = DATABASE_TYPE_META[normalizedType as ConnectionType];

    return {
        src: meta?.src,
        label: meta?.label ?? normalizedType,
        fallback: normalizedType.slice(0, 2),
    };
}

export function DatabaseTypeIcon({ type, className, fallbackClassName }: { type?: string | null; className?: string; fallbackClassName?: string }) {
    const meta = getDatabaseTypeMeta(type);
    const normalizedType = type?.trim().toLowerCase();

    if (meta.src) {
        return (
            <Image
                src={meta.src}
                alt={meta.label}
                width={24}
                height={24}
                className={cn(normalizedType === 'sqlite' ? 'max-h-5 max-w-5' : 'max-h-6 max-w-6', 'object-contain', className)}
            />
        );
    }

    return <span className={cn('text-xs font-semibold uppercase text-muted-foreground', fallbackClassName)}>{meta.fallback}</span>;
}
