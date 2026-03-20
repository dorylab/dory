'use client';

import { useIsMobile } from '@/hooks/use-mobile';
import { DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose, Drawer } from '@/registry/new-york-v4/ui/drawer';
import { QueryInsightsRow } from '@/types/monitoring';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { formatNumber, formatBytes } from '../../utils';
import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { useLocale, useTranslations } from 'next-intl';

export default function QuerySqlCell({ row }: { row: QueryInsightsRow }) {
    const isMobile = useIsMobile();
    const t = useTranslations('Monitoring');
    const locale = useLocale();
    return (
        <Drawer direction={isMobile ? 'bottom' : 'right'}>
            <DrawerTrigger asChild>
                <Button variant="link" className="w-full justify-start px-0 text-left font-mono text-[11px] leading-relaxed">
                    <span className="line-clamp-2 break-all">{row.queryId}</span>
                </Button>
            </DrawerTrigger>
            <DrawerContent className="max-h-[100vh] overflow-y-auto">
                <DrawerHeader className="space-y-1">
                    <DrawerTitle className="text-base font-semibold">{t('SqlDetails.Title')}</DrawerTitle>
                    <DrawerDescription>
                        {row.user} · {row.eventTime}
                    </DrawerDescription>
                </DrawerHeader>
                <div className="flex flex-col gap-4 px-4 pb-2 text-sm">
                    <div className="grid gap-3 md:grid-cols-2">
                        <StatItem label={t('Columns.Duration')} value={t('Common.DurationMs', { value: row.durationMs.toFixed(0) })} />
                        <StatItem label={t('Columns.ReadRows')} value={formatNumber(row.readRows, locale)} />
                        <StatItem label={t('Columns.ReadBytes')} value={formatBytes(row.readBytes)} />
                        <StatItem label={t('Columns.WrittenBytes')} value={row.writtenBytes ? formatBytes(row.writtenBytes) : t('Common.EmptyValue')} />
                        <StatItem label={t('Columns.MemoryUsage')} value={row.memoryUsage ? formatBytes(row.memoryUsage) : t('Common.EmptyValue')} />
                        <StatItem label={t('Columns.Database')} value={row.database ?? t('Common.EmptyValue')} />
                        <StatItem label={t('Columns.User')} value={row.user} />
                        <StatItem label={t('Columns.IP')} value={row.address} />
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-medium text-muted-foreground">{t('Columns.QueryId')}</span>
                        <SmartCodeBlock value={row.queryId} />
                    </div>
                    {row.exception && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
                            <span>{row.exception}</span>
                        </div>
                    )}
                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-medium text-muted-foreground">{t('Columns.Sql')}</span>
                        <SmartCodeBlock value={row.query} />
                    </div>
                </div>
                <DrawerFooter className="px-4 pb-4 pt-2">
                    <DrawerClose asChild>
                        <Button variant="outline" size="sm">
                            {t('Actions.Close')}
                        </Button>
                    </DrawerClose>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}

function StatItem({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-1 font-mono text-sm text-foreground">{value}</div>
        </div>
    );
}
