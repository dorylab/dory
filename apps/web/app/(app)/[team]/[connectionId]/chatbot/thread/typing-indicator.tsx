'use client';

import { useTranslations } from 'next-intl';

export function TypingIndicator() {
    const t = useTranslations('Chatbot');
    return (
        <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground bg-muted/60">
            <span>{t('Typing')}</span>
            <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-[pulse_1s_ease-in-out_infinite] rounded-full bg-current" />
                <span className="h-1.5 w-1.5 animate-[pulse_1s_ease-in-out_0.2s_infinite] rounded-full bg-current" />
                <span className="h-1.5 w-1.5 animate-[pulse_1s_ease-in-out_0.4s_infinite] rounded-full bg-current" />
            </span>
        </div>
    );
}
