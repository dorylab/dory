'use client';

import * as React from 'react';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/registry/new-york-v4/ui/tooltip';

type OverflowTooltipProps = {
    text?: string | null;
    className?: string;
    children?: React.ReactNode;
    disableTooltip?: boolean; // 🔹 新增：禁用内部 tooltip（允许外部 tooltip 包裹）
};

/**
 * Single-line truncation wrapper.
 * Shows tooltip ONLY when overflowed AND not disabled.
 */
export const OverflowTooltip = React.forwardRef<HTMLSpanElement, OverflowTooltipProps>(
    function OverflowTooltip(
        { text, className, children, disableTooltip = false },
        ref
    ) {
        const innerRef = React.useRef<HTMLSpanElement | null>(null);
        const mergedRef = (node: HTMLSpanElement) => {
            innerRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLSpanElement | null>).current = node;
        };

        const [overflowing, setOverflowing] = React.useState(false);

        const checkOverflow = React.useCallback(() => {
            const el = innerRef.current;
            if (!el) return;
            setOverflowing(el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight);
        }, []);

        React.useLayoutEffect(() => {
            const el = innerRef.current;
            if (!el) return;

            checkOverflow();
            const ro = new ResizeObserver(() => checkOverflow());
            ro.observe(el);
            return () => ro.disconnect();
        }, [checkOverflow, text]);

        const baseSpan = (
            <span ref={mergedRef} className={className}>
                {children ?? text}
            </span>
        );

        // ① 完全禁用 tooltip → 只做 ellipsis，不显示内部 tooltip
        if (disableTooltip) return baseSpan;

        // ② 不溢出，不显示 tooltip
        if (!text || !overflowing) return baseSpan;

        // ③ 默认行为：显示溢出 tooltip
        return (
            <Tooltip>
                <TooltipTrigger asChild>{baseSpan}</TooltipTrigger>
                <TooltipContent className="max-w-[360px] break-words text-xs">{text}</TooltipContent>
            </Tooltip>
        );
    }
);
