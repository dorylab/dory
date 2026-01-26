"use client";
import { useRef } from "react";
import { ColumnFilter } from "./type";

export type FieldKind = 'string' | 'number';

export function normType(t?: string | null) {
    return (t ?? '').toLowerCase().replace(/\s+/g, '');
}

export function mapDbTypeToTwoKinds(dbType?: string | null): FieldKind {
    const t = normType(dbType);
    if (/(^(u)?int(\d+)?$|int|integer|bigint|smallint|tinyint(?!\s*\(1\))|float|double|decimal|numeric|real|serial|money)/.test(t)) {
        return 'number';
    }
    
    return 'string';
}

export function buildEqualsFilterFromCell(params: { colName: string; colType?: string | null; raw: any }): ColumnFilter {
    const { colName, colType, raw } = params;

    
    if (raw === null || raw === undefined || raw === '') {
        return { col: colName, kind: 'string', op: 'empty', value: '', caseSensitive: false };
    }

    const kind = mapDbTypeToTwoKinds(colType);

    if (kind === 'number') {
        const n = typeof raw === 'number' ? raw : Number(raw);
        
        if (!Number.isFinite(n)) {
            return { col: colName, kind: 'string', op: 'equals', value: String(raw), caseSensitive: false };
        }
        return { col: colName, kind: 'number', op: 'eq', value: String(n), caseSensitive: false };
    }

    
    return { col: colName, kind: 'string', op: 'equals', value: String(raw), caseSensitive: false };
}
