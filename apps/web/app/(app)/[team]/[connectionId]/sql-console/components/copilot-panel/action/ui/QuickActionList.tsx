import type { LocalizedQuickActionMeta } from '@/lib/copilot/action/registry';
import { AlertTriangle, Gauge, Layers3, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type QuickActionListItem = LocalizedQuickActionMeta & {
    available?: boolean;
    reason?: string;
};

type QuickActionListProps = {
    items: QuickActionListItem[];
    onSelect?: (item: QuickActionListItem) => void;
};

type QuickActionItemProps = {
    item: QuickActionListItem;
    onSelect?: (item: QuickActionListItem) => void;
};

export function QuickActionItem({ item, onSelect }: QuickActionItemProps) {
    const disabled = item.available === false;
    const Icon = QUICK_ACTION_ICONS[item.icon as keyof typeof QUICK_ACTION_ICONS];

    return (
        <button
            type="button"
            onClick={() => (disabled ? undefined : onSelect?.(item))}
            className={`flex w-full items-start gap-3 rounded-lg border bg-background px-4 py-3 text-left transition ${
                disabled
                    ? 'cursor-not-allowed opacity-60'
                    : 'hover:border-primary/40 hover:bg-muted/40'
            }`}
            disabled={disabled}
        >
            <span className="flex size-5 items-center justify-center text-muted-foreground">
                {Icon ? <Icon className="h-4 w-4 text-violet-400" /> : item.icon}
            </span>
            <span className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">{item.title}</span>
                <span className="text-xs text-muted-foreground">{item.description}</span>
                {disabled && item.reason ? (
                    <span className="text-[11px] text-amber-600">{item.reason}</span>
                ) : null}
            </span>
        </button>
    );
}

const QUICK_ACTION_ICONS = {
    AlertTriangle,
    Gauge,
    Sparkles,
    Layers3,
} as const;

export function QuickActionList({ items, onSelect }: QuickActionListProps) {
    const t = useTranslations('SqlConsole');
    return (
        <div className="flex h-full min-h-0 flex-col gap-3 p-4">
            <div className="text-xs font-medium text-muted-foreground">{t('Copilot.Actions.Title')}</div>
            {items.length ? (
                <div className="flex flex-col gap-3">
                    {items.map(item => (
                        <QuickActionItem key={item.intent} item={item} onSelect={onSelect} />
                    ))}
                </div>
            ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    {t('Copilot.Actions.Empty')}
                </div>
            )}
        </div>
    );
}
