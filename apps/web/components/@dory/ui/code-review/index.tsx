'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CopyButton } from '../copy-button';

type CodeReviewProps = {
    original: string;
    modified: string;

    height?: number | string; // 默认 320
    defaultView?: 'preview' | 'diff';

    onCopy?: (text: string) => void;
    onApply?: (text: string) => void | Promise<void>;

    // 可选：自定义 Header 左侧内容（例如标题/摘要）
    headerLeftSlot?: React.ReactNode;

    // 可选：渲染顶部右侧操作（例如更多菜单）
    headerRightSlot?: React.ReactNode;

    // 可选：让外部决定按钮 disabled/loading
    applyDisabled?: boolean;
    copyDisabled?: boolean;

    className?: string;
};

type DiffRow =
    | { type: 'context'; text: string; oldNo: number | null; newNo: number | null }
    | { type: 'del'; text: string; oldNo: number | null; newNo: number | null }
    | { type: 'add'; text: string; oldNo: number | null; newNo: number | null };

function splitLines(s: string) {
    // 保留空行（SQL 很常见），去掉末尾多余 \r
    return s.replace(/\r/g, '').split('\n');
}

/**
 * LCS-based line diff: 产生最小编辑（行级）
 * 复杂度 O(n*m)，SQL 预览场景通常 n,m<200，完全够用
 */
function diffLinesLCS(oldLines: string[], newLines: string[]): Array<{ op: 'equal' | 'add' | 'del'; text: string }> {
    const n = oldLines.length;
    const m = newLines.length;

    // dp[i][j] = LCS length for oldLines[i:] & newLines[j:]
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            if (oldLines[i] === newLines[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
            else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }

    const out: Array<{ op: 'equal' | 'add' | 'del'; text: string }> = [];
    let i = 0;
    let j = 0;

    while (i < n && j < m) {
        if (oldLines[i] === newLines[j]) {
            out.push({ op: 'equal', text: oldLines[i] });
            i++;
            j++;
            continue;
        }
        // 决策：删 old 还是加 new
        if (dp[i + 1][j] >= dp[i][j + 1]) {
            out.push({ op: 'del', text: oldLines[i] });
            i++;
        } else {
            out.push({ op: 'add', text: newLines[j] });
            j++;
        }
    }

    while (i < n) out.push({ op: 'del', text: oldLines[i++] });
    while (j < m) out.push({ op: 'add', text: newLines[j++] });

    return out;
}

function buildUnifiedRows(original: string, modified: string): DiffRow[] {
    const oldLines = splitLines(original);
    const newLines = splitLines(modified);

    const ops = diffLinesLCS(oldLines, newLines);

    let oldNo = 1;
    let newNo = 1;

    const rows: DiffRow[] = [];
    for (const op of ops) {
        if (op.op === 'equal') {
            rows.push({ type: 'context', text: op.text, oldNo, newNo });
            oldNo++;
            newNo++;
        } else if (op.op === 'del') {
            rows.push({ type: 'del', text: op.text, oldNo, newNo: null });
            oldNo++;
        } else {
            rows.push({ type: 'add', text: op.text, oldNo: null, newNo });
            newNo++;
        }
    }
    return rows;
}

function clampHeight(h?: number | string) {
    if (h == null) return '320px';
    return typeof h === 'number' ? `${h}px` : h;
}

export function CodeReview({
    original,
    modified,
    height = 320,
    defaultView = 'diff',
    onCopy,
    onApply,
    headerLeftSlot,
    headerRightSlot,
    applyDisabled,
    copyDisabled,
    className,
}: CodeReviewProps) {
    const t = useTranslations('DoryUI');
    const [view, setView] = useState<'preview' | 'diff'>(defaultView);
    const [applied, setApplied] = useState(false);

    const rows = useMemo(() => buildUnifiedRows(original, modified), [original, modified]);

    useEffect(() => {
        // Reset applied state when content changes.
        setApplied(false);
    }, [original, modified]);

    const handleCopy = async () => {
        const text = modified ?? '';
        if (onCopy) return onCopy(text);
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // ignore
        }
    };

    const handleApply = async () => {
        if (!onApply) return;
        try {
            await onApply(modified ?? '');
            setApplied(true);
        } catch {
            setApplied(false);
        }
    };

    const containerHeight = clampHeight(height);
    const rootClassName = [className].filter(Boolean).join(' ');
    const resolvedHeaderLeftSlot = headerLeftSlot ?? (
        <div className="text-xs font-medium text-muted-foreground">{t('CodeReview.Header')}</div>
    );

    return (
        <div className={rootClassName}>
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 pt-4">
                <div className="min-w-0">{resolvedHeaderLeftSlot}</div>

                <div className="flex items-center gap-2">
                    <div className="flex rounded-lg bg-muted p-1 dark:bg-neutral-800/60">
                        <button
                            type="button"
                            onClick={() => setView('preview')}
                            className={[
                                'px-3 py-1 text-xs rounded-md transition',
                                view === 'preview'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground',
                            ].join(' ')}
                        >
                            {t('CodeReview.Preview')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setView('diff')}
                            className={[
                                'px-3 py-1 text-xs rounded-md transition',
                                view === 'diff'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground',
                            ].join(' ')}
                        >
                            {t('CodeReview.Diff')}
                        </button>
                    </div>
                    {headerRightSlot}
                </div>
            </div>

            {/* Body */}
            <div className="pt-4">
                <div
                    className="bg-card overflow-auto"
                    style={{ maxHeight: containerHeight }}
                >
                    {view === 'preview' ? (
                        <pre className="m-0 inline-block min-w-full p-3 text-[12px] leading-5 text-foreground whitespace-pre">
                            {modified}
                        </pre>
                    ) : (
                        <div className="font-mono text-[12px] leading-5 w-max min-w-full">
                            {rows.map((r, idx) => {
                                const isAdd = r.type === 'add';
                                const isDel = r.type === 'del';

                                const bg = isAdd
                                    ? 'bg-emerald-500/10 dark:bg-emerald-500/15'
                                    : isDel
                                      ? 'bg-red-500/10 dark:bg-red-500/18'
                                      : 'bg-transparent';
                                const sign =
                                    isAdd ? '+' : isDel ? '-' : ' ';

                                // 单列行号策略：优先显示 newNo，其次 oldNo（让用户始终有一列数字，不出现 1 1）
                                const lineNo = r.newNo ?? r.oldNo ?? null;

                                return (
                                    <div key={idx} className={`flex w-full ${bg}`}>
                                        {/* Line No (single column) */}
                                        <div className="w-10 shrink-0 select-none text-right pr-3 pl-3 py-0.5 text-muted-foreground">
                                            {lineNo ?? ''}
                                        </div>

                                        {/* Sign */}
                                        <div className="w-4 shrink-0 select-none py-0.5 text-muted-foreground">
                                            {sign}
                                        </div>

                                        {/* Text */}
                                        <div className="min-w-0 flex-1 py-0.5 pr-3 text-foreground whitespace-pre">
                                            {r.text.length ? r.text : ' '}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer actions */}
                <div className="mt-4 pb-4 pr-4 flex items-center justify-end gap-2">
                    {/* <button
                        type="button"
                        onClick={handleCopy}
                        disabled={!!copyDisabled}
                        className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-100 hover:bg-neutral-700 disabled:opacity-50"
                    >
                        Copy
                    </button> */}
                    <CopyButton text={modified}
                        className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground hover:bg-muted/80 disabled:opacity-50"
                    />
                    <button
                        type="button"
                        onClick={handleApply}
                        disabled={!!applyDisabled || applied || !onApply}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90 disabled:opacity-50"
                    >
                        {applied ? t('CodeReview.Applied') : t('CodeReview.Apply')}
                    </button>
                </div>
            </div>
        </div>
    );
}

export type { CodeReviewProps };
