import { Check, Copy } from 'lucide-react';

import { Button } from '@/registry/new-york-v4/ui/button';
import { useTranslations } from 'next-intl';

type ActionResultBarProps = {
  onApply?: () => void;
  onCopy?: () => void;
  applyLabel?: string;
  copyLabel?: string;
  disabled?: boolean;
};

export function ActionResultBar({
  onApply,
  onCopy,
  applyLabel,
  copyLabel,
  disabled,
}: ActionResultBarProps) {
  const t = useTranslations('SqlConsole');
  const resolvedApplyLabel = applyLabel ?? t('Copilot.Action.Apply');
  const resolvedCopyLabel = copyLabel ?? t('Copilot.Action.Copy');
  const isCopyDisabled = disabled || !onCopy;
  const isApplyDisabled = disabled || !onApply;

  return (
    <div className="border-t px-4 py-3">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCopy} disabled={isCopyDisabled}>
          <Copy className="mr-2 h-4 w-4" />
          {resolvedCopyLabel}
        </Button>
        <Button size="sm" onClick={onApply} disabled={isApplyDisabled}>
          <Check className="mr-2 h-4 w-4" />
          {resolvedApplyLabel}
        </Button>
      </div>
    </div>
  );
}
