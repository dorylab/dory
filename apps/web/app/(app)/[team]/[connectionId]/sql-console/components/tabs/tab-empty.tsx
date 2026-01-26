import { Button } from "@/registry/new-york-v4/ui/button";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

export default function SQLTabEmpty(props: { addTab: () => void }) {
    const { addTab } = props;
    const t = useTranslations('SqlConsole');
    return (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <div className="mb-6 text-5xl font-semibold tracking-wide">
                {t('Empty.Brand')}
            </div>
            <div className="space-y-2 text-sm mb-6 text-center">
                <div>{t('Empty.ShortcutRunSelection')}</div>
                <div>{t('Empty.ShortcutSave')}</div>
                <div>{t('Empty.ShortcutNewTab')}</div>
                <div>{t('Empty.ShortcutToggleCopilot')}</div>
                <div>{t('Empty.ShortcutFormat')}</div>
            </div>
            <Button onClick={addTab}>
                <Plus className="mr-2 h-4 w-4" />
                {t('Empty.NewConsole')}
            </Button>
        </div>
    );
}
