import type { ReactNode } from 'react';

export function SettingsRow({ label, description, children }: { label: ReactNode; description?: string; children: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
                <div className="text-sm font-medium">{label}</div>
                {description ? <div className="text-xs text-muted-foreground mt-1">{description}</div> : null}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}
