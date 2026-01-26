'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { useTranslations } from 'next-intl';

interface CopyButtonProps extends React.ComponentProps<typeof Button> {
    text: string;

    label?: string | React.ReactNode;

    copiedLabel?: string;

    timeout?: number;

}

export const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProps>(
    (
        {
            text,
            className,
            label,
            copiedLabel,
            timeout = 2000,
            ...buttonProps
        },
        ref,
    ) => {
        const t = useTranslations('DoryUI');
        const resolvedLabel = label ?? t('CopyButton.Copy');
        const resolvedCopiedLabel = copiedLabel ?? t('CopyButton.Copied');
        const [copied, setCopied] = useState(false);
        const timerRef = useRef<number | null>(null);

        useEffect(() => {
            return () => {
                if (timerRef.current) window.clearTimeout(timerRef.current);
            };
        }, []);

        const copyText = async (content: string) => {
            try {
                if (navigator?.clipboard?.writeText) {
                    await navigator.clipboard.writeText(content);
                    return;
                }
            } catch {
                // fallback below
            }

            const ta = document.createElement('textarea');
            ta.value = content;
            ta.setAttribute('readonly', 'true');
            ta.style.position = 'fixed';
            ta.style.top = '0';
            ta.style.left = '0';
            ta.style.opacity = '0';
            ta.style.pointerEvents = 'none';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
            } finally {
                document.body.removeChild(ta);
            }
        };

        const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
            buttonProps.onClick?.(e);
            if (e.defaultPrevented) return;

            await copyText(text);

            setCopied(true);
            if (timerRef.current) window.clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(() => setCopied(false), timeout);
        };

        return (
            <button
                ref={ref}
                type="button"
                onClick={handleClick}
                className={className}
                {...buttonProps}
            >
                {copied ? resolvedCopiedLabel : resolvedLabel}
            </button>
        );
    },
);

CopyButton.displayName = 'CopyButton';
