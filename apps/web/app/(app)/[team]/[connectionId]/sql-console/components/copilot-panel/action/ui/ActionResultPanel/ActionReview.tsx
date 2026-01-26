'use client';

import { CodeReview, type CodeReviewProps } from '@/components/@dory/ui/code-review';

type ActionReviewProps = Omit<CodeReviewProps, 'headerLeftSlot'> & {
    title?: string;
    summary?: string;
};

export function ActionReview({
    title = 'SQL Preview',
    summary,
    ...codeReviewProps
}: ActionReviewProps) {

    return <div className="m-4 rounded-lg border">
        <CodeReview {...codeReviewProps} className='bg-muted/40 ' />
    </div>

}

export type { ActionReviewProps };
