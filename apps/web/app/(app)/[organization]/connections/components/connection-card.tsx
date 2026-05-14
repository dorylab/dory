'use client';

import { MotionHighlight } from '@/components/animate-ui/effects/motion-highlight';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/registry/new-york-v4/ui/tooltip';
import { ConnectionCheckStatus, ConnectionListItem } from '@dory/shared/types/connections';
import { Edit2, Trash2, Loader2, FileSpreadsheet, FileText, FileArchive } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useHasMounted } from '@/hooks/use-has-mounted';
import { getConnectionLocationLabel } from '@/lib/connection/display';

type Props = {
    connectionItem: ConnectionListItem;
    id: string;
    connectLoading?: boolean;
    errorMessage?: string | null;
    onEdit: (connection: ConnectionListItem) => void;
    onConnect: (connection: ConnectionListItem, navigateToConsole?: boolean) => void;
    onDeleteRequest?: (connection: ConnectionListItem) => void;
};

function parseConnectionOptions(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
        } catch {
            return {};
        }
    }
    return {};
}

function getLocalFilesMeta(connection: ConnectionListItem['connection']) {
    if (connection.type !== 'duckdb') return null;
    const options = parseConnectionOptions(connection.options);
    if (options.managedBy !== 'local-files' || options.mode !== 'localFilesDataset') return null;

    const sourceType = typeof options.sourceType === 'string' ? options.sourceType : null;
    const sourcePath = typeof options.sourcePath === 'string' ? options.sourcePath : null;
    return {
        sourceType,
        sourcePath,
    };
}

function getFileIcon(sourceType?: string | null) {
    if (sourceType === 'excel' || sourceType === 'csv') return FileSpreadsheet;
    if (sourceType === 'parquet') return FileArchive;
    return FileText;
}

export default function ConnectionCard({ connectionItem, id, connectLoading, errorMessage, onEdit, onConnect, onDeleteRequest }: Props) {
    const t = useTranslations('Connections');
    const hasMounted = useHasMounted();

    const connection = connectionItem.connection;
    const locationLabel = getConnectionLocationLabel(connection);
    const localFilesMeta = getLocalFilesMeta(connection);
    const isLocalFiles = Boolean(localFilesMeta);
    const FileIcon = getFileIcon(localFilesMeta?.sourceType);
    const lastCheckStatus = (connection?.lastCheckStatus ?? 'unknown') as ConnectionCheckStatus;
    const lastCheckError = connection?.lastCheckError;
    const lastCheckAt = connection?.lastCheckAt ? new Date(connection.lastCheckAt) : null;
    const lastCheckLatencyMs = connection?.lastCheckLatencyMs;

    const derivedStatus: ConnectionCheckStatus = errorMessage ? 'error' : lastCheckStatus;
    const statusDot =
        derivedStatus === 'error' ? 'bg-red-500' : derivedStatus === 'ok' ? 'bg-emerald-500' : 'bg-muted-foreground/60';

    const statusLabelMap: Record<ConnectionCheckStatus, string> = {
        ok: t('Connected'),
        error: t('Disconnected'),
        unknown: t('Unknown'),
    };

    const statusIndicatorContent = (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`h-2 w-2 rounded-full ${statusDot}`} />
            {/* <span className="capitalize">{statusLabelMap[derivedStatus] ?? derivedStatus}</span> */}
            {/* {typeof lastCheckLatencyMs === 'number' && <span className="text-[11px] text-muted-foreground/80">{lastCheckLatencyMs}ms</span>} */}
        </div>
    );

    const tooltipLines = [
        errorMessage ?? lastCheckError,
        hasMounted && lastCheckAt ? t('Last check', { time: lastCheckAt.toLocaleString() }) : null,
        typeof lastCheckLatencyMs === 'number' ? t('Latency', { latency: lastCheckLatencyMs }) : null,
    ].filter(Boolean) as string[];

    const statusIndicator =
        tooltipLines.length > 0 ? (
            <Tooltip>
                <TooltipTrigger asChild>{statusIndicatorContent}</TooltipTrigger>
                <TooltipContent>
                    <div className="space-y-1">
                        {tooltipLines.map(line => (
                            <p key={line} className="max-w-xs break-words text-center text-xs">
                                {line}
                            </p>
                        ))}
                    </div>
                </TooltipContent>
            </Tooltip>
        ) : (
            statusIndicatorContent
        );

    return (
        <MotionHighlight
            hover
            className="rounded-xl"
            key={id}
        >
            <div
                data-testid="connection-card"
                data-connection-id={id}
                className="flex cursor-pointer flex-col rounded-xl border p-4"
                onClick={() => {
                    if (!connectLoading) {
                        onConnect(connectionItem, true);
                    };
                }}

            >
                <div className="mb-2 flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        {isLocalFiles ? (
                            <div className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
                                <FileIcon className="h-4 w-4" />
                            </div>
                        ) : null}
                        <p className="mb-1 min-h-6 truncate text-base font-medium">{connectionItem?.connection.name}</p>
                    </div>
                    {connectLoading ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        </div>
                    ) : (
                        statusIndicator
                    )}
                </div>

                {isLocalFiles ? (
                    <div className="mb-1 flex min-h-6 items-center gap-2">
                        <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs font-medium uppercase">
                            {localFilesMeta?.sourceType ?? 'file'}
                        </span>
                        <span className="text-muted-foreground text-sm">Open Files</span>
                    </div>
                ) : (
                    <p className="mb-1 min-h-6 text-base font-medium">{connectionItem?.identities[0].username}</p>
                )}

                <Tooltip>
                    <TooltipTrigger asChild>
                        <p className="min-h-6 max-w-full truncate text-sm text-muted-foreground">{locationLabel}</p>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p className="max-w-xs break-all text-center">{locationLabel}</p>
                    </TooltipContent>
                </Tooltip>

                <div className='flex justify-between'>
                    
                    <Tooltip>
                        <TooltipTrigger asChild aria-hidden={false}>
                            <Button
                                variant="ghost"
                                className="group h-8 w-8 cursor-pointer text-n4 hover:text-n1 dark:text-n6 dark:hover:text-n1"
                                onClick={e => {
                                    e.stopPropagation();
                                    onEdit(connectionItem);
                                }}
                            >
                                <Edit2 className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{t('ConnectionContent.Edit.title')}</p>
                        </TooltipContent>
                    </Tooltip>

                    
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 cursor-pointer text-n4 hover:text-n1 dark:text-n6 dark:hover:text-n1"
                                onClick={e => {
                                    e.stopPropagation();
                                    onDeleteRequest?.(connectionItem);
                                }}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{t('ConnectionContent.Delete')}</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>
        </MotionHighlight>
    );
}
