'use client';

import { MotionHighlight } from '@/components/animate-ui/effects/motion-highlight';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/registry/new-york-v4/ui/tooltip';
import { ConnectionCheckStatus, ConnectionListItem } from '@dory/shared/types/connections';
import { Copy, Edit2, EllipsisVertical, FolderOpen, Loader2, Server, Trash2, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useHasMounted } from '@/hooks/use-has-mounted';
import { getConnectionLocationLabel } from '@/lib/connection/display';
import { DatabaseTypeIcon, getDatabaseTypeMeta } from './database-type-icon';
import { FileTypeIcon, getFileTypeLabel } from './file-type-icon';
import { getConnectionEnvironmentOption } from '../constants';

type Props = {
    connectionItem: ConnectionListItem;
    id: string;
    connectLoading?: boolean;
    errorMessage?: string | null;
    onEdit: (connection: ConnectionListItem) => void;
    onConnect: (connection: ConnectionListItem, navigateToConsole?: boolean) => void;
    onDuplicateRequest?: (connection: ConnectionListItem) => void;
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

export default function ConnectionCard({ connectionItem, id, connectLoading, errorMessage, onEdit, onConnect, onDuplicateRequest, onDeleteRequest }: Props) {
    const t = useTranslations('Connections');
    const hasMounted = useHasMounted();

    const connection = connectionItem.connection;
    const locationLabel = getConnectionLocationLabel(connection);
    const localFilesMeta = getLocalFilesMeta(connection);
    const isLocalFiles = Boolean(localFilesMeta);
    const connectionTypeLabel = isLocalFiles ? getFileTypeLabel(localFilesMeta?.sourceType) : getDatabaseTypeMeta(connection.type).label;
    const identityUsername = connectionItem.identities[0]?.username;
    const lastCheckStatus = (connection?.lastCheckStatus ?? 'unknown') as ConnectionCheckStatus;
    const lastCheckError = connection?.lastCheckError;
    const lastCheckAt = connection?.lastCheckAt ? new Date(connection.lastCheckAt) : null;
    const lastCheckLatencyMs = connection?.lastCheckLatencyMs;
    const environmentOption = getConnectionEnvironmentOption(connection.environment);
    const isProdEnvironment = environmentOption?.value === 'prod';

    const derivedStatus: ConnectionCheckStatus = errorMessage ? 'error' : lastCheckStatus;
    const statusDot = derivedStatus === 'error' ? 'bg-red-500' : derivedStatus === 'ok' ? 'bg-emerald-500' : 'bg-muted-foreground/60';

    const statusIndicatorContent = (
        <div className="flex h-9 w-9 items-center justify-center text-xs text-muted-foreground">
            <span className={`h-2 w-2 rounded-full ${statusDot}`} />
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
        <MotionHighlight hover className="rounded-xl" key={id}>
            <div
                data-testid="connection-card"
                data-connection-id={id}
                className="group flex cursor-pointer flex-col rounded-xl border p-3"
                onClick={() => {
                    if (!connectLoading) {
                        onConnect(connectionItem, true);
                    }
                }}
            >
                <div className="mb-1.5 grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-x-1">
                    <div className="flex h-9 w-9 items-center justify-center">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                {isLocalFiles ? (
                                    <div className="text-muted-foreground flex h-9 w-9 items-center justify-center">
                                        <FileTypeIcon sourceType={localFilesMeta?.sourceType} />
                                    </div>
                                ) : (
                                    <div className="flex h-9 w-9 items-center justify-center">
                                        <DatabaseTypeIcon type={connection.type} />
                                    </div>
                                )}
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{connectionTypeLabel}</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    <div className="flex min-h-6 min-w-0 items-center gap-2">
                        <OverflowTooltip text={connectionItem?.connection?.name} className="block min-w-0 max-w-full truncate text-base font-medium" />
                        {isProdEnvironment ? (
                            <Badge variant="outline" className="shrink-0 border-red-500/30 bg-red-500/10 px-1.5 text-[10px] font-medium text-red-700 dark:text-red-300">
                                {t(environmentOption.translationKey)}
                            </Badge>
                        ) : null}
                    </div>
                    <div className="flex h-9 w-9 items-center justify-center">
                        {connectLoading ? (
                            <div className="flex h-9 w-9 items-center justify-center text-xs text-muted-foreground">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            </div>
                        ) : (
                            statusIndicator
                        )}
                    </div>
                </div>

                {isLocalFiles ? (
                    <div className="mb-1 grid min-h-6 grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-x-1">
                        <FolderOpen className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground text-sm">{t('Empty.openFiles')}</span>
                    </div>
                ) : (
                    <div className="mb-1 grid min-h-6 grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-x-1">
                        {identityUsername ? (
                            <>
                                <User className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
                                <OverflowTooltip text={identityUsername} className="block min-w-0 max-w-full truncate text-sm text-muted-foreground" />
                            </>
                        ) : null}
                    </div>
                )}

                <div className="grid min-h-6 grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-x-1">
                    <Server className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
                    <OverflowTooltip text={locationLabel} className="block min-w-0 max-w-full truncate text-sm text-muted-foreground" />
                </div>

                <div className="-mb-0.5 mt-2 grid min-h-9 grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-x-1">
                    <div className="flex h-9 w-9 items-center justify-center">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="h-9 w-9 cursor-pointer text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
                                    onClick={e => {
                                        e.stopPropagation();
                                        onEdit(connectionItem);
                                    }}
                                    aria-label={t('Edit')}
                                >
                                    <Edit2 className="h-5 w-5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{t('Edit')}</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    <span aria-hidden="true" />
                    <div className="flex h-9 w-9 items-center justify-center">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="h-9 w-9 cursor-pointer text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground"
                                    onClick={e => {
                                        e.stopPropagation();
                                    }}
                                    aria-label={t('More actions')}
                                >
                                    <EllipsisVertical className="h-5 w-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" side="bottom" onClick={e => e.stopPropagation()}>
                                {!isLocalFiles ? (
                                    <DropdownMenuItem
                                        onClick={e => {
                                            e.stopPropagation();
                                            onDuplicateRequest?.(connectionItem);
                                        }}
                                    >
                                        <Copy className="h-4 w-4" />
                                        {t('Duplicate')}
                                    </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem
                                    variant="destructive"
                                    onClick={e => {
                                        e.stopPropagation();
                                        onDeleteRequest?.(connectionItem);
                                    }}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    {t('Delete')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>
        </MotionHighlight>
    );
}
