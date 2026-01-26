import { Card, CardHeader, CardTitle, CardContent } from "@/registry/new-york-v4/ui/card";
import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";

type AssistantFallbackCardProps = {
    reason?: string;
};

export function AssistantFallbackCard({ reason }: AssistantFallbackCardProps) {
    const t = useTranslations("DoryUI");
    const missingAiEnv =
        typeof reason === 'string' &&
        (reason.includes('DORY_AI_API_KEY') || reason.includes('DORY_AI_URL') || reason.includes('MISSING_AI_ENV'));
    return (
        <Card className="mt-3 border-destructive/40 bg-destructive/5">
            <CardHeader className="space-y-1.5">
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {missingAiEnv ? t("AssistantFallback.MissingAiEnvTitle") : t("AssistantFallback.Title")}
                </CardTitle>
                {reason && !missingAiEnv && <p className="text-xs text-destructive/80">{reason}</p>}
            </CardHeader>
            <CardContent>
                <p className="text-sm text-foreground">
                    {missingAiEnv ? t("AssistantFallback.MissingAiEnvDescription") : t("AssistantFallback.Description")}
                </p>
            </CardContent>
        </Card>
    );
}
