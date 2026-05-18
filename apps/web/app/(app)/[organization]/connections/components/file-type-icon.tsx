'use client';

import Image from 'next/image';
import { FileArchive, FileSpreadsheet, FileText } from 'lucide-react';

import { cn } from '@dory/web-utils';

type FileTypeMeta = {
    src: string;
    label: string;
};

const FILE_TYPE_META: Partial<Record<string, FileTypeMeta>> = {
    excel: { src: '/images/file-types/excel.svg', label: 'Excel' },
    parquet: { src: '/images/file-types/parquet.svg', label: 'Apache Parquet' },
};

function getFallbackIcon(sourceType?: string | null) {
    if (sourceType === 'csv') return FileSpreadsheet;
    if (sourceType === 'parquet') return FileArchive;
    return FileText;
}

export function FileTypeIcon({
    sourceType,
    className,
}: {
    sourceType?: string | null;
    className?: string;
}) {
    const normalizedType = sourceType?.trim().toLowerCase();
    const meta = normalizedType ? FILE_TYPE_META[normalizedType] : undefined;

    if (meta) {
        return <Image src={meta.src} alt={meta.label} width={24} height={24} className={cn('max-h-6 max-w-6 object-contain', className)} />;
    }

    const FallbackIcon = getFallbackIcon(normalizedType);
    return <FallbackIcon className={cn('h-4 w-4', className)} />;
}
