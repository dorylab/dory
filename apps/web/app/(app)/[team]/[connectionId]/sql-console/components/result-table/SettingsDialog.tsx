'use client';
import React from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/registry/new-york-v4/ui/dialog';
import { Label } from '@/registry/new-york-v4/ui/label';
import { Switch } from '@/registry/new-york-v4/ui/switch';
import { Input } from '@/registry/new-york-v4/ui/input';
import { useLocale, useTranslations } from 'next-intl';

const ROW_BUDGET_MIN = 5_000;
const ROW_BUDGET_MAX = 1_000_000;
const PRESETS = [10_000, 50_000, 100_000, 200_000, 500_000];

export function SettingsDialog(props: {
    open: boolean;
    setOpen: (b: boolean) => void;
    debugMode: boolean;
    setDebugMode: (b: boolean) => void;
    uiRowBudget: number;
    setUiRowBudget: (n: number) => void;
}) {
    const { open, setOpen, debugMode, setDebugMode, uiRowBudget, setUiRowBudget } = props;
    const [draft, setDraft] = React.useState(String(uiRowBudget));
    const t = useTranslations('SqlConsole');
    const locale = useLocale();

    React.useEffect(() => {
        if (open) setDraft(String(uiRowBudget));
    }, [open, uiRowBudget]);

    const apply = () => {
        const n = Number(draft.replace(/[,_\s]/g, ''));
        if (Number.isFinite(n)) setUiRowBudget(n);
    };

    return (
        <Dialog
            open={open}
            onOpenChange={v => {
                setOpen(v);
                if (v) setDraft(String(uiRowBudget));
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('Settings.Title')}</DialogTitle>
                    <DialogDescription>{t('Settings.Description')}</DialogDescription>
                </DialogHeader>
                {/* Debug toggle */}
                <div className="flex items-center justify-between py-1">
                    <div className="space-y-0.5">
                        <Label htmlFor="debug-switch">{t('Settings.DebugMode')}</Label>
                        <p className="text-xs text-muted-foreground">{t('Settings.DebugHint')}</p>
                    </div>
                    <Switch id="debug-switch" checked={debugMode} onCheckedChange={setDebugMode} />
                </div>

                {/* Row budget control */}
                <div className="space-y-2 pt-4">
                    <Label htmlFor="row-budget">{t('Settings.RowBudgetLabel')}</Label>
                    <div className="flex gap-2">
                        <Input
                            id="row-budget"
                            type="number"
                            min={ROW_BUDGET_MIN}
                            max={ROW_BUDGET_MAX}
                            step={1000}
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') apply();
                            }}
                            className="w-40"
                        />
                        <Button variant="outline" onClick={apply} title={t('Actions.Apply')}>
                            {t('Actions.Apply')}
                        </Button>
                        <Button variant="outline" onClick={() => setUiRowBudget(100_000)} title={t('Actions.ResetDefault')}>
                            {t('Actions.Reset')}
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {PRESETS.map(p => (
                            <Button key={p} variant="outline" size="sm" onClick={() => setUiRowBudget(p)} title={t('Settings.RowsTitle', { value: p.toLocaleString(locale) })}>
                                {p.toLocaleString(locale)}
                            </Button>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {t('Settings.RowBudgetHint')}
                    </p>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        {t('Actions.Close')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
