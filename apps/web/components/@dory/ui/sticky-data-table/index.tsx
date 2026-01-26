'use client';

import * as React from 'react';
import type { Table, Row } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

type ColumnMeta = {
    className?: string;
    cellClassName?: string;
};

type StickyDataTableProps<TData> = {
    /** 已经用 useReactTable 创建好的 table 实例 */
    table: Table<TData>;
    /** 正在加载（用于空态提示文案） */
    loading?: boolean;
    /** 没数据时显示的提示文案 */
    emptyText?: React.ReactNode;
    /** 外层滚动容器 className（有 relative + overflow-auto） */
    containerClassName?: string;
    /** table 本身的 className */
    tableClassName?: string;
    /** 最小高度，例如 "360px" */
    minBodyHeight?: string;
    /** 最大高度，例如 "calc(100vh - 290px)" */
    maxBodyHeight?: string;

    /** 行双击事件（一般用来打开详情） */
    onRowDoubleClick?: (row: Row<TData>) => void;
    /** 自定义行 className */
    getRowClassName?: (row: Row<TData>) => string | undefined;
};

/**
 * 通用 sticky 表头 + 空态占位 的表格容器
 */
export function StickyDataTable<TData>({
    table,
    loading,
    emptyText,
    containerClassName,
    tableClassName,
    minBodyHeight = '360px',
    maxBodyHeight,
    onRowDoubleClick,
    getRowClassName,
}: StickyDataTableProps<TData>) {
    const t = useTranslations('DoryUI');
    const resolvedEmptyText = emptyText ?? t('Table.Empty');
    const loadingText = t('Table.Loading');
    const rows = table.getRowModel().rows;
    const isEmpty = rows.length === 0;
    const visibleColumns = table.getVisibleLeafColumns();

    return (
        <div
            className={cn('relative overflow-auto', containerClassName)}
            style={{
                minHeight: minBodyHeight,
                maxHeight: maxBodyHeight,
            }}
        >
            <table
                className={cn(
                    // table-fixed 保证列宽按 meta 里的 w-[xxxpx] 为主
                    'w-full table-fixed border-separate border-spacing-0 text-xs',
                    tableClassName,
                )}
            >
                {/* 表头始终渲染，用于说明字段结构 */}
                <thead className="bg-card">
                    {table.getHeaderGroups().map(headerGroup => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map(header => {
                                const meta = header.column.columnDef.meta as ColumnMeta | undefined;
                                return (
                                    <th
                                        key={header.id}
                                        colSpan={header.colSpan}
                                        className={cn(
                                            'sticky top-0 z-20 bg-card text-xs font-medium text-center border-b-0 px-3 py-3 shadow-[0_1px_0_rgba(0,0,0,0.08)]',
                                            meta?.className,
                                        )}
                                    >
                                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                    </th>
                                );
                            })}
                        </tr>
                    ))}
                </thead>

                <tbody>
                    {isEmpty ? (
                        // 只渲染一行“透明占位行”，给浏览器一个完整的列结构
                        <tr className="invisible">
                            {visibleColumns.map(column => {
                                const meta = column.columnDef.meta as ColumnMeta | undefined;
                                return (
                                    <td key={column.id} className={cn('border-b px-3 py-2 align-middle text-center', meta?.className, meta?.cellClassName)}>
                                        &nbsp;
                                    </td>
                                );
                            })}
                        </tr>
                    ) : (
                        rows.map(row => (
                            <tr key={row.id} onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined} className={cn(getRowClassName?.(row))}>
                                {row.getVisibleCells().map(cell => {
                                    const meta = cell.column.columnDef.meta as ColumnMeta | undefined;
                                    return (
                                        <td key={cell.id} className={cn('border-b px-3 py-2 align-middle text-center', meta?.className, meta?.cellClassName)}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>

            {/* 空态 / 加载 覆盖层，不参与 table 布局，避免拉扯表头 */}
            {isEmpty && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                    {loading ? loadingText : resolvedEmptyText}
                </div>
            )}
        </div>
    );
}
