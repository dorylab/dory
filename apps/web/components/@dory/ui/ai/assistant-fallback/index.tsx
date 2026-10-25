import { Card, CardHeader, CardTitle, CardContent } from '@/registry/new-york-v4/ui/card';
import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { USE_CLOUD_AI } from '@/app/config/app';

type AssistantFallbackCardProps = {
    reason?: string;
    historical?: boolean;
    reportSaveFailed?: boolean;
};

export function AssistantFallbackCard({ reason, historical = false, reportSaveFailed = false }: AssistantFallbackCardProps) {
    const t = useTranslations('DoryUI');
    const isDesktopCloud = USE_CLOUD_AI;
    const isMissingEnvReason = typeof reason === 'string' && (reason.includes('DORY_AI_API_KEY') || reason.includes('DORY_AI_URL') || reason.includes('MISSING_AI_ENV'));
    const missingAiEnv = isMissingEnvReason && !isDesktopCloud;
    const showReason = reason && !(isMissingEnvReason && isDesktopCloud);
    if (historical) {
        return (
            <details className="my-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                <summary className="cursor-pointer">{t('AssistantFallback.HistoricalTitle')}</summary>
                <p className="mt-2 whitespace-pre-wrap break-words">{t('AssistantFallback.HistoricalDescription')}</p>
                {showReason && <p className="mt-2 whitespace-pre-wrap break-words text-xs">{reason}</p>}
            </details>
        );
    }
    return (
        <Card className="mt-3 border-destructive/40 bg-destructive/5" data-testid={reportSaveFailed ? 'report-save-error' : undefined}>
            <CardHeader className="space-y-1.5">
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {reportSaveFailed ? t('AssistantFallback.ReportNotSavedTitle') : missingAiEnv ? t('AssistantFallback.MissingAiEnvTitle') : t('AssistantFallback.Title')}
                </CardTitle>
                {showReason && !missingAiEnv && !reportSaveFailed && <p className="text-xs text-destructive/80">{reason}</p>}
            </CardHeader>
            <CardContent>
                <p className="text-sm text-foreground">
                    {reportSaveFailed
                        ? t('AssistantFallback.ReportNotSavedDescription')
                        : missingAiEnv
                          ? t('AssistantFallback.MissingAiEnvDescription')
                          : t('AssistantFallback.Description')}
                </p>
                {reportSaveFailed && showReason && (
                    <details className="mt-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer">{t('AssistantFallback.FailureDetails')}</summary>
                        <p className="mt-2 whitespace-pre-wrap break-words">{reason}</p>
                    </details>
                )}
            </CardContent>
        </Card>
    );
}
