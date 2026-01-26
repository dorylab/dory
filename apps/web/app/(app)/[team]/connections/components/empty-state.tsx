'use client';

import { Button } from '@/registry/new-york-v4/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/registry/new-york-v4/ui/empty';
import { Database } from 'lucide-react';
import { useTranslations } from 'next-intl';

type ConnectionsEmptyStateProps = {
  searchQuery: string;
  showSearchEmpty: boolean;
  onAddConnection: () => void;
  onLoadDemoData?: () => void;
};

export function ConnectionsEmptyState({
  searchQuery,
  showSearchEmpty,
  onAddConnection,
  onLoadDemoData,
}: ConnectionsEmptyStateProps) {
  const t = useTranslations('Connections');
  const trimmedQuery = searchQuery.trim();

  const title = showSearchEmpty ? t('Search.emptyTitle') : t('Empty.title');
  const desc = showSearchEmpty
    ? t('Search.emptyDescription', { query: trimmedQuery })
    : t('Empty.description');

  return (
    <div className="mt-12">
      <Empty className="mx-auto max-w-md">
        <EmptyMedia
          variant="icon"
          className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-muted text-primary"
        >
          <Database className="h-8 w-8" />
        </EmptyMedia>

        <EmptyHeader className="gap-2 text-center">
          <EmptyTitle className="text-2xl font-semibold tracking-tight">
            {title}
          </EmptyTitle>

          <EmptyDescription className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
            {desc}
          </EmptyDescription>
        </EmptyHeader>

        <EmptyContent className="gap-3">
          <div className="mx-auto flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center">
            <Button className="w-full sm:w-auto" onClick={onAddConnection}>
              {t('Add Connection')}
            </Button>

            {!showSearchEmpty && onLoadDemoData && (
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={onLoadDemoData}
              >
                {t('Empty.loadDemo')}
              </Button>
            )}
          </div>

          {/* {!showSearchEmpty && (
            <div className="mx-auto max-w-sm text-center text-xs text-muted-foreground">
              {t('Empty.supportHint')}
            </div>
          )} */}

          {showSearchEmpty && (
            <div className="mx-auto max-w-sm text-center text-xs text-muted-foreground">
              {t('Search.emptyHint')}
            </div>
          )}
        </EmptyContent>
      </Empty>
    </div>
  );
}
