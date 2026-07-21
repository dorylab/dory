'use client';

import * as React from 'react';
import Link from 'next/link';
import { Graph } from '@dagrejs/dagre';
import { layout } from '@dagrejs/dagre';
import {
    Background,
    Controls,
    Handle,
    MarkerType,
    MiniMap,
    Position,
    ReactFlow,
    ReactFlowProvider,
    getNodesBounds,
    useEdgesState,
    useNodesState,
    useReactFlow,
    type Edge,
    type Node,
    type NodeProps,
} from '@xyflow/react';
import { useQuery } from '@tanstack/react-query';
import { Check, Columns3, Download, ExternalLink, Focus, GitFork, KeyRound, Maximize2, Network, RefreshCw, Search, X } from 'lucide-react';
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { executeActionClient } from '@/lib/actions/client';
import { buildExplorerObjectPath } from '@/lib/explorer/build-path';
import type { ExplorerBaseParams } from '@/lib/explorer/types';
import { cn } from '@dory/web-utils';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/registry/new-york-v4/ui/drawer';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import type { DatabaseMeta, SchemaGraphColumnMode, SchemaGraphResult, SchemaGraphTable } from '@dory/drivers/types';
import { useExplorerConnectionContext } from '@/components/explorer/core/explorer-store';

import '@xyflow/react/dist/style.css';

const NODE_WIDTH = 320;
const NODE_HEADER_HEIGHT = 58;
const NODE_COLUMN_HEIGHT = 34;
const NODE_FOOTER_HEIGHT = 34;
const EXPORT_PADDING = 48;
const COLUMN_MODES = ['all', 'keys'] as const;

function ToolbarTooltip({ label, children }: { label: string; children: React.ReactElement }) {
    return (
        <Tooltip delayDuration={250}>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
                {label}
            </TooltipContent>
        </Tooltip>
    );
}

type TableNodeData = Record<string, unknown> & {
    table: SchemaGraphTable;
    href: string;
    dimmed: boolean;
    focused: boolean;
    incomingColumns: string[];
    outgoingColumns: string[];
    relationshipCount: number;
};

type TableNode = Node<TableNodeData, 'schemaTable'>;

type SchemaGraphEdgeData = Record<string, unknown> & {
    relationshipId: string;
    pairIndex: number;
};

type SchemaGraphEdge = Edge<SchemaGraphEdgeData>;

function TableNodeComponent({ data }: NodeProps<TableNode>) {
    const t = useTranslations('SchemaGraph');
    const { table, href, dimmed, focused, incomingColumns, outgoingColumns, relationshipCount } = data;
    const incoming = React.useMemo(() => new Set(incomingColumns), [incomingColumns]);
    const outgoing = React.useMemo(() => new Set(outgoingColumns), [outgoingColumns]);

    return (
        <div
            className={cn(
                'w-[320px] overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-[opacity,box-shadow,border-color]',
                table.scope === 'related' && 'border-dashed bg-card/80',
                focused && 'border-primary shadow-md ring-2 ring-primary/20',
                dimmed && 'opacity-25',
            )}
        >
            <div className="flex h-[58px] items-center justify-between gap-3 border-b bg-muted/35 px-4">
                <div className="min-w-0">
                    <div className="truncate font-mono text-[15px] font-semibold leading-5">{table.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                        <span className="truncate">{table.schema ?? table.database}</span>
                        <span aria-hidden>·</span>
                        <span className="text-primary/80">{t('Relation count', { count: relationshipCount })}</span>
                    </div>
                </div>
                {table.scope === 'related' ? <Badge variant="outline">{t('Related')}</Badge> : null}
            </div>
            <div>
                {table.columns.length > 0 ? (
                    table.columns.map(column => {
                        const hasIncoming = incoming.has(column.name);
                        const hasOutgoing = outgoing.has(column.name);
                        const FieldIcon = column.isPrimaryKey ? KeyRound : column.isForeignKey ? GitFork : Columns3;
                        return (
                            <div key={column.name} className="relative flex h-[34px] items-center gap-2.5 border-b border-border/55 px-4 last:border-b-0">
                                {hasIncoming ? (
                                    <Handle
                                        id={`target:${column.name}`}
                                        type="target"
                                        position={Position.Left}
                                        className="!-left-1 !h-2.5 !w-2.5 !border-2 !border-background !bg-primary"
                                    />
                                ) : null}
                                <FieldIcon
                                    className={cn('h-4 w-4 shrink-0', column.isPrimaryKey ? 'text-amber-500' : column.isForeignKey ? 'text-primary' : 'text-muted-foreground/70')}
                                    aria-hidden
                                />
                                <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{column.name}</span>
                                <span className="max-w-28 truncate font-mono text-[11px] text-muted-foreground">{column.dataType ?? '—'}</span>
                                {column.nullable === false && !column.isPrimaryKey ? <span className="text-xs font-semibold text-destructive/70">*</span> : null}
                                {hasOutgoing ? (
                                    <Handle
                                        id={`source:${column.name}`}
                                        type="source"
                                        position={Position.Right}
                                        className="!-right-1 !h-2.5 !w-2.5 !border-2 !border-background !bg-primary"
                                    />
                                ) : null}
                            </div>
                        );
                    })
                ) : (
                    <div className="flex h-9 items-center px-3 text-xs text-muted-foreground">{t('No key columns')}</div>
                )}
            </div>
            <div className="flex h-[34px] items-center justify-end border-t bg-muted/15 px-2">
                <Button asChild variant="ghost" size="sm" className="nodrag nopan h-7 text-xs">
                    <Link href={href} onClick={event => event.stopPropagation()}>
                        {t('Open table')}
                        <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                </Button>
            </div>
        </div>
    );
}

const NODE_TYPES = { schemaTable: TableNodeComponent };

function nodeHeight(table: SchemaGraphTable) {
    return NODE_HEADER_HEIGHT + Math.max(table.columns.length * NODE_COLUMN_HEIGHT, 36) + NODE_FOOTER_HEIGHT;
}

function layoutNodes(nodes: TableNode[], edges: SchemaGraphEdge[]) {
    const graph = new Graph().setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: 'LR', ranksep: 96, nodesep: 44, marginx: 24, marginy: 24 });
    for (const node of nodes) graph.setNode(node.id, { width: NODE_WIDTH, height: nodeHeight(node.data.table) });
    for (const edge of edges) graph.setEdge(edge.source, edge.target);
    layout(graph);
    return nodes.map(node => {
        const point = graph.node(node.id);
        return {
            ...node,
            position: {
                x: point.x - NODE_WIDTH / 2,
                y: point.y - nodeHeight(node.data.table) / 2,
            },
        };
    });
}

function downloadDataUrl(dataUrl: string, fileName: string) {
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = fileName;
    anchor.click();
}

type SchemaGraphCanvasInnerProps = {
    baseParams: ExplorerBaseParams;
    database: string;
    schema?: string;
};

function SchemaGraphCanvasInner({ baseParams, database, schema }: SchemaGraphCanvasInnerProps) {
    const t = useTranslations('SchemaGraph');
    const { resolvedTheme } = useTheme();
    const { connectionId } = useExplorerConnectionContext();
    const flow = useReactFlow<TableNode, SchemaGraphEdge>();
    const graphRootRef = React.useRef<HTMLDivElement>(null);
    const [schemaState, setSchemaState] = useQueryState('graphSchemas', parseAsArrayOf(parseAsString).withDefault([]));
    const [columnModeState, setColumnModeState] = useQueryState('graphColumns', parseAsStringLiteral(COLUMN_MODES));
    const [search, setSearch] = useQueryState('graphSearch', parseAsString.withDefault(''));
    const [focusedTableId, setFocusedTableId] = useQueryState('graphFocus', parseAsString);
    const [seedTable, setSeedTable] = useQueryState('graphSeed', parseAsString);
    const [isFullscreen, setIsFullscreen] = React.useState(false);
    const [nodes, setNodes, onNodesChange] = useNodesState<TableNode>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<SchemaGraphEdge>([]);

    const schemasQuery = useQuery({
        queryKey: ['schema-graph-schemas', connectionId, database],
        enabled: Boolean(connectionId && database && !schema),
        queryFn: async ({ signal }) => {
            return executeActionClient<DatabaseMeta[]>('schema.listSchemas', { connectionId, database }, { currentConnectionId: connectionId, signal });
        },
        staleTime: 5 * 60 * 1000,
    });
    const availableSchemas = React.useMemo(() => schemasQuery.data ?? [], [schemasQuery.data]);
    const effectiveSchemas = React.useMemo(() => {
        if (schema) return [schema];
        if (schemaState.length > 0) return schemaState;
        if (availableSchemas.length === 0) return [];
        const defaultSchema = availableSchemas.find(option => option.value.toLowerCase() === 'public') ?? availableSchemas[0];
        return defaultSchema ? [defaultSchema.value] : [];
    }, [availableSchemas, schema, schemaState]);
    const parsedSeed = React.useMemo(() => {
        const value = seedTable?.trim();
        if (!value) return undefined;
        const parts = value.split('.');
        return parts.length > 1 ? [{ schema: parts[0], name: parts.slice(1).join('.') }] : [{ schema: effectiveSchemas[0] ?? null, name: value }];
    }, [effectiveSchemas, seedTable]);

    const graphQuery = useQuery({
        queryKey: ['schema-graph', connectionId, database, effectiveSchemas, parsedSeed],
        enabled: Boolean(connectionId && database && (schema || !schemasQuery.isPending)),
        queryFn: async ({ signal }) => {
            const response = await executeActionClient<{ graph: SchemaGraphResult }>(
                'schema.getGraph',
                {
                    connectionId,
                    database,
                    schemas: effectiveSchemas.length > 0 ? effectiveSchemas : undefined,
                    focusTables: parsedSeed,
                    depth: parsedSeed || schema ? 1 : 0,
                    columnMode: 'all',
                },
                { currentConnectionId: connectionId, signal },
            );
            return response.graph;
        },
        staleTime: 60 * 1000,
    });
    const graph = graphQuery.data;
    const effectiveColumnMode: SchemaGraphColumnMode = columnModeState ?? ((graph?.tables.length ?? 0) <= 30 ? 'all' : 'keys');

    const relationshipColumnsByTable = React.useMemo(() => {
        const result = new Map<string, Set<string>>();
        for (const relationship of graph?.relationships ?? []) {
            const sourceColumns = result.get(relationship.sourceTableId) ?? new Set<string>();
            const targetColumns = result.get(relationship.targetTableId) ?? new Set<string>();
            relationship.sourceColumns.forEach(column => sourceColumns.add(column));
            relationship.targetColumns.forEach(column => targetColumns.add(column));
            result.set(relationship.sourceTableId, sourceColumns);
            result.set(relationship.targetTableId, targetColumns);
        }
        return result;
    }, [graph?.relationships]);

    const visibleTables = React.useMemo(() => {
        return (graph?.tables ?? []).map(table => ({
            ...table,
            columns:
                effectiveColumnMode === 'keys'
                    ? table.columns.filter(column => column.isPrimaryKey || column.isForeignKey || relationshipColumnsByTable.get(table.id)?.has(column.name))
                    : table.columns,
        }));
    }, [effectiveColumnMode, graph?.tables, relationshipColumnsByTable]);

    const adjacency = React.useMemo(() => {
        const result = new Map<string, Set<string>>();
        for (const relationship of graph?.relationships ?? []) {
            const source = result.get(relationship.sourceTableId) ?? new Set<string>();
            const target = result.get(relationship.targetTableId) ?? new Set<string>();
            source.add(relationship.targetTableId);
            target.add(relationship.sourceTableId);
            result.set(relationship.sourceTableId, source);
            result.set(relationship.targetTableId, target);
        }
        return result;
    }, [graph?.relationships]);

    const relatedToFocus = React.useMemo(() => (focusedTableId ? new Set([focusedTableId, ...(adjacency.get(focusedTableId) ?? [])]) : null), [adjacency, focusedTableId]);

    React.useEffect(() => {
        if (!graph || graph.status !== 'ready') {
            setNodes([]);
            setEdges([]);
            return;
        }
        const incomingColumns = new Map<string, Set<string>>();
        const outgoingColumns = new Map<string, Set<string>>();
        const relationshipCounts = new Map<string, number>();
        for (const relationship of graph.relationships) {
            const incoming = incomingColumns.get(relationship.targetTableId) ?? new Set<string>();
            const outgoing = outgoingColumns.get(relationship.sourceTableId) ?? new Set<string>();
            relationship.targetColumns.forEach(column => incoming.add(column));
            relationship.sourceColumns.forEach(column => outgoing.add(column));
            incomingColumns.set(relationship.targetTableId, incoming);
            outgoingColumns.set(relationship.sourceTableId, outgoing);
            relationshipCounts.set(relationship.sourceTableId, (relationshipCounts.get(relationship.sourceTableId) ?? 0) + 1);
            if (relationship.targetTableId !== relationship.sourceTableId) {
                relationshipCounts.set(relationship.targetTableId, (relationshipCounts.get(relationship.targetTableId) ?? 0) + 1);
            }
        }
        const nextNodes: TableNode[] = visibleTables.map(table => {
            return {
                id: table.id,
                type: 'schemaTable',
                position: { x: 0, y: 0 },
                data: {
                    table,
                    href: buildExplorerObjectPath(baseParams, {
                        database,
                        schema: table.schema ?? undefined,
                        objectKind: 'table',
                        name: table.name,
                    }),
                    focused: false,
                    dimmed: false,
                    incomingColumns: Array.from(incomingColumns.get(table.id) ?? []),
                    outgoingColumns: Array.from(outgoingColumns.get(table.id) ?? []),
                    relationshipCount: relationshipCounts.get(table.id) ?? 0,
                },
            };
        });
        const tableById = new Map(visibleTables.map(table => [table.id, table]));
        const nextEdges: SchemaGraphEdge[] = graph.relationships.flatMap(relationship => {
            const sourceTable = tableById.get(relationship.sourceTableId);
            const targetTable = tableById.get(relationship.targetTableId);
            return relationship.sourceColumns.map((sourceColumn, pairIndex) => {
                const targetColumn = relationship.targetColumns[pairIndex];
                const sourceVisible = sourceTable?.columns.some(column => column.name === sourceColumn);
                const targetVisible = targetTable?.columns.some(column => column.name === targetColumn);
                return {
                    id: `${relationship.id}:${pairIndex}`,
                    source: relationship.sourceTableId,
                    target: relationship.targetTableId,
                    sourceHandle: sourceVisible ? `source:${sourceColumn}` : undefined,
                    targetHandle: targetVisible && targetColumn ? `target:${targetColumn}` : undefined,
                    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
                    style: { strokeWidth: 1.5, opacity: 0.9 },
                    labelStyle: { fontSize: 10, fill: 'var(--muted-foreground)' },
                    data: { relationshipId: relationship.id, pairIndex },
                };
            });
        });
        setEdges(nextEdges);
        setNodes(layoutNodes(nextNodes, nextEdges));
        requestAnimationFrame(() => void flow.fitView({ padding: 0.16, duration: 0 }));
    }, [baseParams, database, flow, graph, setEdges, setNodes, visibleTables]);

    React.useEffect(() => {
        const searchValue = search.trim().toLowerCase();
        setNodes(current =>
            current.map(node => {
                const table = node.data.table;
                const matchesSearch = !searchValue || table.name.toLowerCase().includes(searchValue) || (table.schema ?? '').toLowerCase().includes(searchValue);
                return {
                    ...node,
                    data: {
                        ...node.data,
                        focused: focusedTableId === node.id,
                        dimmed: !matchesSearch || Boolean(relatedToFocus && !relatedToFocus.has(node.id)),
                    },
                };
            }),
        );
        setEdges(current =>
            current.map(edge => {
                const related = !relatedToFocus || (relatedToFocus.has(edge.source) && relatedToFocus.has(edge.target));
                const relationship = graph?.relationships.find(candidate => candidate.id === edge.data?.relationshipId);
                const cardinality = relationship?.sourceUnique == null ? null : relationship.sourceUnique ? (relationship.sourceOptional ? '0..1:1' : '1:1') : 'N:1';
                const label = [relationship?.constraintName, cardinality].filter(Boolean).join(' · ');
                return {
                    ...edge,
                    label: focusedTableId && related && edge.data?.pairIndex === 0 && label ? label : undefined,
                    animated: Boolean(focusedTableId && related),
                    style: { strokeWidth: related ? 1.5 : 1, opacity: related ? 0.9 : 0.15 },
                };
            }),
        );
    }, [focusedTableId, graph?.relationships, relatedToFocus, search, setEdges, setNodes]);

    const relayout = React.useCallback(() => {
        setNodes(current => layoutNodes(current, edges));
        requestAnimationFrame(() => void flow.fitView({ padding: 0.16, duration: 250 }));
    }, [edges, flow, setNodes]);

    React.useEffect(() => {
        if (!isFullscreen) return;
        const frame = requestAnimationFrame(() => void flow.fitView({ padding: 0.12, duration: 0 }));
        return () => cancelAnimationFrame(frame);
    }, [flow, isFullscreen]);

    const exportGraph = React.useCallback(
        async (format: 'png' | 'svg') => {
            const viewport = graphRootRef.current?.querySelector<HTMLElement>('.react-flow__viewport');
            const currentNodes = flow.getNodes();
            if (!viewport || currentNodes.length === 0) return;
            const bounds = getNodesBounds(currentNodes);
            const width = Math.ceil(bounds.width + EXPORT_PADDING * 2);
            const height = Math.ceil(bounds.height + EXPORT_PADDING * 2);
            const style = {
                width: `${width}px`,
                height: `${height}px`,
                transform: `translate(${EXPORT_PADDING - bounds.x}px, ${EXPORT_PADDING - bounds.y}px) scale(1)`,
            };
            const image = await import('html-to-image');
            const backgroundColor = getComputedStyle(document.body).backgroundColor;
            const dataUrl =
                format === 'png'
                    ? await image.toPng(viewport, { width, height, pixelRatio: 2, backgroundColor, style })
                    : await image.toSvg(viewport, { width, height, backgroundColor, style });
            downloadDataUrl(dataUrl, `${database}-schema-graph.${format}`);
        },
        [database, flow],
    );

    const toggleSchema = React.useCallback(
        (value: string, checked: boolean) => {
            const current = schemaState.length > 0 ? schemaState : effectiveSchemas;
            const next = checked ? Array.from(new Set([...current, value])) : current.filter(schemaName => schemaName !== value);
            void setSchemaState(next);
            void setSeedTable(null);
        },
        [effectiveSchemas, schemaState, setSchemaState, setSeedTable],
    );

    const graphWorkspace = (
        <div className={cn('flex h-full min-h-0 flex-1 flex-col gap-2 pb-0', isFullscreen ? 'px-3 pb-3 pt-2' : 'min-h-[420px]')} ref={graphRootRef}>
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-48 flex-1 sm:max-w-72">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={event => void setSearch(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === 'Enter' && graph?.status === 'too_large' && search.trim()) void setSeedTable(search.trim());
                        }}
                        placeholder={graph?.status === 'too_large' ? t('Enter a seed table') : t('Search tables')}
                        className="h-8 pl-8 text-xs"
                    />
                </div>
                {!schema && availableSchemas.length > 0 ? (
                    <DropdownMenu>
                        <ToolbarTooltip label={t('Schemas')}>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8">
                                    {t('Schemas')} ({effectiveSchemas.length || availableSchemas.length})
                                </Button>
                            </DropdownMenuTrigger>
                        </ToolbarTooltip>
                        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                            <DropdownMenuLabel>{t('Schemas')}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {availableSchemas.map(option => (
                                <DropdownMenuCheckboxItem
                                    key={option.value}
                                    checked={effectiveSchemas.includes(option.value)}
                                    onCheckedChange={checked => toggleSchema(option.value, checked === true)}
                                    onSelect={event => event.preventDefault()}
                                >
                                    {option.label}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : null}
                <ToolbarTooltip label={effectiveColumnMode === 'all' ? t('All columns') : t('Keys only')}>
                    <Button variant="outline" size="sm" className="h-8" onClick={() => void setColumnModeState(effectiveColumnMode === 'all' ? 'keys' : 'all')}>
                        <Check className="h-4 w-4" />
                        {effectiveColumnMode === 'all' ? t('All columns') : t('Keys only')}
                    </Button>
                </ToolbarTooltip>
                <ToolbarTooltip label={t('Auto layout')}>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={relayout} aria-label={t('Auto layout')}>
                        <Network className="h-4 w-4" />
                    </Button>
                </ToolbarTooltip>
                <ToolbarTooltip label={t('Fit view')}>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => void flow.fitView({ padding: 0.16, duration: 250 })} aria-label={t('Fit view')}>
                        <Focus className="h-4 w-4" />
                    </Button>
                </ToolbarTooltip>
                {!isFullscreen ? (
                    <ToolbarTooltip label={t('Open fullscreen')}>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setIsFullscreen(true)} aria-label={t('Open fullscreen')}>
                            <Maximize2 className="h-4 w-4" />
                        </Button>
                    </ToolbarTooltip>
                ) : null}
                <ToolbarTooltip label={t('Refresh')}>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => void graphQuery.refetch()} aria-label={t('Refresh')}>
                        <RefreshCw className={cn('h-4 w-4', graphQuery.isFetching && 'animate-spin')} />
                    </Button>
                </ToolbarTooltip>
                <DropdownMenu>
                    <ToolbarTooltip label={t('Export')}>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8" disabled={!graph?.tables.length}>
                                <Download className="h-4 w-4" />
                                {t('Export')}
                            </Button>
                        </DropdownMenuTrigger>
                    </ToolbarTooltip>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => void exportGraph('png')}>PNG</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void exportGraph('svg')}>SVG</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/20">
                {graphQuery.isPending || schemasQuery.isPending ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 text-sm text-muted-foreground">{t('Loading graph')}</div>
                ) : null}
                {graphQuery.isError ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-sm text-destructive">{t('Failed to load graph')}</div>
                ) : null}
                {graph?.status === 'too_large' ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center">
                        <div className="max-w-lg space-y-2 rounded-lg border bg-card p-5 shadow-sm">
                            <div className="font-medium">{t('Graph is too large')}</div>
                            <div className="text-sm text-muted-foreground">
                                {t('Graph limits', {
                                    tables: graph.totalTables,
                                    relationships: graph.totalRelationships,
                                    maxTables: graph.limits.maxTables,
                                    maxRelationships: graph.limits.maxRelationships,
                                })}
                            </div>
                            <div className="text-xs text-muted-foreground">{t('Narrow scope help')}</div>
                        </div>
                    </div>
                ) : null}
                {graph?.status === 'ready' && graph.tables.length === 0 ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-muted-foreground">{t('No tables')}</div>
                ) : null}
                <ReactFlow<TableNode, SchemaGraphEdge>
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={NODE_TYPES}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={(_, node) => void setFocusedTableId(focusedTableId === node.id ? null : node.id)}
                    onPaneClick={() => void setFocusedTableId(null)}
                    nodesConnectable={false}
                    elementsSelectable
                    fitView
                    minZoom={0.15}
                    maxZoom={1.8}
                    deleteKeyCode={null}
                    colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
                >
                    <Background gap={24} size={1} color="var(--border)" />
                    <Controls showInteractive={false} />
                    {nodes.length > 20 ? <MiniMap pannable zoomable nodeColor="var(--primary)" /> : null}
                </ReactFlow>
                {graph?.status === 'ready' && graph.tables.length > 0 && graph.relationships.length === 0 ? (
                    <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-md border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                        {graph.capabilities.relationships ? t('No foreign keys') : t('Relationships unavailable')}
                    </div>
                ) : null}
            </div>
        </div>
    );

    return (
        <>
            {isFullscreen ? null : graphWorkspace}
            <Drawer direction="bottom" dismissible={false} handleOnly open={isFullscreen} onOpenChange={setIsFullscreen}>
                <DrawerContent className="!inset-0 !m-0 !h-dvh !max-h-none !w-screen !max-w-none !rounded-none !border-0 !p-0 [&>div:first-child]:!hidden">
                    <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
                        <DrawerTitle className="font-mono text-sm font-semibold">
                            {t('Graph')} · {database}
                        </DrawerTitle>
                        <DrawerDescription className="sr-only">{t('Fullscreen description')}</DrawerDescription>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsFullscreen(false)} aria-label={t('Exit fullscreen')}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                    {isFullscreen ? graphWorkspace : null}
                </DrawerContent>
            </Drawer>
        </>
    );
}

export function SchemaGraphCanvas(props: SchemaGraphCanvasInnerProps) {
    return (
        <ReactFlowProvider>
            <SchemaGraphCanvasInner {...props} />
        </ReactFlowProvider>
    );
}
