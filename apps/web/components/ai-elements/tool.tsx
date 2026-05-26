'use client';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';
import { cn } from '@dory/web-utils';
import type { DynamicToolUIPart, ToolUIPart } from 'ai';
import { CheckCircleIcon, ChevronDownIcon, ChevronRightIcon, ClockIcon, LoaderCircleIcon, XCircleIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { isValidElement } from 'react';
import { CodeBlock } from './code-block';
import { Shimmer } from './shimmer';

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => <Collapsible className={cn('not-prose mb-2 w-full overflow-hidden', className)} {...props} />;

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
    title?: string;
    className?: string;
} & (
    | { type: ToolUIPart['type']; state: ToolUIPart['state']; toolName?: never }
    | {
          type: DynamicToolUIPart['type'];
          state: DynamicToolUIPart['state'];
          toolName: string;
      }
);

export const getStatusMeta = (status: ToolPart['state']) => {
    const labels: Record<ToolPart['state'], string> = {
        'input-streaming': 'Pending',
        'input-available': 'Running',
        'approval-requested': 'Awaiting Approval',
        'approval-responded': 'Responded',
        'output-available': 'Completed',
        'output-error': 'Error',
        'output-denied': 'Denied',
    };

    const icons: Record<ToolPart['state'], ReactNode> = {
        'input-streaming': <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground/60" />,
        'input-available': <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground/60" />,
        'approval-requested': <ClockIcon className="size-3.5 text-yellow-600" />,
        'approval-responded': <CheckCircleIcon className="size-3.5 text-blue-600" />,
        'output-available': <CheckCircleIcon className="size-3.5 text-green-600" />,
        'output-error': <XCircleIcon className="size-3.5 text-red-600" />,
        'output-denied': <XCircleIcon className="size-3.5 text-orange-600" />,
    };

    return {
        icon: icons[status],
        label: labels[status],
    };
};

export const getStatusBadge = (status: ToolPart['state']) => {
    const statusMeta = getStatusMeta(status);
    const isLoadingState = status === 'input-streaming' || status === 'input-available';

    return (
        <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground/65 transition-colors group-hover/tool-header:text-muted-foreground/85">
            {statusMeta.icon}
            {isLoadingState ? (
                <Shimmer as="span" className="text-[12px] leading-5" duration={1.25}>
                    {statusMeta.label}
                </Shimmer>
            ) : (
                <span>{statusMeta.label}</span>
            )}
        </span>
    );
};

export const ToolHeader = ({ className, title, type, state, toolName, ...props }: ToolHeaderProps) => {
    const derivedName = type === 'dynamic-tool' ? toolName : type.split('-').slice(1).join('-');
    const isLoadingState = state === 'input-streaming' || state === 'input-available';
    const displayTitle = title ?? derivedName;

    return (
        <CollapsibleTrigger
            className={cn('group/tool-header flex w-full cursor-pointer items-center gap-1.5 py-1 text-left transition-colors hover:text-muted-foreground/90', className)}
            {...props}
        >
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {isLoadingState ? (
                    <Shimmer as="span" className="truncate text-[13px] leading-5" duration={1.25}>
                        {displayTitle}
                    </Shimmer>
                ) : (
                    <span className="truncate text-[13px] leading-5 text-muted-foreground/85 transition-colors group-hover/tool-header:text-foreground/85">{displayTitle}</span>
                )}
                {getStatusBadge(state)}
                <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/55 transition-colors group-hover/tool-header:text-muted-foreground/75 group-data-[state=open]/tool-header:hidden" />
                <ChevronDownIcon className="hidden size-3.5 shrink-0 text-muted-foreground/55 transition-colors group-hover/tool-header:text-muted-foreground/75 group-data-[state=open]/tool-header:block" />
            </div>
        </CollapsibleTrigger>
    );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
    <CollapsibleContent
        className={cn(
            'pt-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2',
            className,
        )}
        {...props}
    />
);

export type ToolInputProps = ComponentProps<'div'> & {
    input: ToolPart['input'];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
    <div className={cn('space-y-2 overflow-hidden', className)} {...props}>
        <h4 className="font-medium text-muted-foreground text-[11px] uppercase tracking-[0.18em]">Parameters</h4>
        <div className="rounded-xl border border-border/60 bg-background">
            <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
        </div>
    </div>
);

export type ToolOutputProps = ComponentProps<'div'> & {
    output: ToolPart['output'];
    errorText: ToolPart['errorText'];
};

export const ToolOutput = ({ className, output, errorText, ...props }: ToolOutputProps) => {
    if (!(output || errorText)) {
        return null;
    }

    let Output = <div>{output as ReactNode}</div>;

    if (typeof output === 'object' && !isValidElement(output)) {
        Output = <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />;
    } else if (typeof output === 'string') {
        Output = <CodeBlock code={output} language="json" />;
    }

    return (
        <div className={cn('space-y-2', className)} {...props}>
            <h4 className="font-medium text-muted-foreground text-[11px] uppercase tracking-[0.18em]">{errorText ? 'Error' : 'Result'}</h4>
            <div
                className={cn(
                    'overflow-x-auto rounded-xl border border-border/60 text-xs [&_table]:w-full',
                    errorText ? 'bg-destructive/10 text-destructive' : 'bg-background text-foreground',
                )}
            >
                {errorText && <div>{errorText}</div>}
                {Output}
            </div>
        </div>
    );
};
