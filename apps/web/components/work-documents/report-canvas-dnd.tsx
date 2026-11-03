'use client';

import { useRef, useState, type ReactNode } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, rectIntersection, useSensor, useSensors } from '@dnd-kit/core';
import type { WorkspaceChartSpec } from '@dory/shared/types/workspace-chart';
import { BarChart3, Table2, GripVertical } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type ReportCanvasSource = {
    resultId: string;
    artifactId: string;
    title: string;
    tabTitle: string;
    resultLabel: string;
    sourceLabel: string;
    chartSpec?: WorkspaceChartSpec;
};
export type ReportDragItem = { kind: 'result'; source: ReportCanvasSource } | { kind: 'block'; blockId: string; title: string };
export type ReportDropTarget = { kind: 'gap'; anchorId: string; position: 'before' | 'after' | 'end' } | { kind: 'replace'; blockId: string };

export function ReportCanvasDnd({
    children,
    onStart,
    onEnd,
    onCancel,
}: {
    children: ReactNode;
    onStart: (item: ReportDragItem) => void;
    onEnd: (item: ReportDragItem, target?: ReportDropTarget) => void;
    onCancel: () => void;
}) {
    const t = useTranslations('WorkDocuments.ConnectedWorkspace');
    const frozen = useRef<ReportDragItem | undefined>(undefined);
    const [active, setActive] = useState<ReportDragItem>();
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
    return (
        <DndContext
            sensors={sensors}
            collisionDetection={args => (args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args))}
            accessibility={{ screenReaderInstructions: { draggable: t('DragInstructions') } }}
            onDragStart={event => {
                const item = structuredClone(event.active.data.current?.item as ReportDragItem);
                frozen.current = item;
                setActive(item);
                onStart(item);
            }}
            onDragCancel={() => {
                frozen.current = undefined;
                setActive(undefined);
                onCancel();
            }}
            onDragEnd={event => {
                const item = frozen.current;
                frozen.current = undefined;
                setActive(undefined);
                if (item) onEnd(item, event.over?.data.current?.target as ReportDropTarget | undefined);
            }}
        >
            {children}
            <DragOverlay dropAnimation={null}>
                {active && (
                    <div className="pointer-events-none flex max-w-72 items-center gap-2 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-lg">
                        {active.kind === 'block' ? <GripVertical className="size-4" /> : active.source.chartSpec ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
                        <div className="min-w-0">
                            <p className="truncate font-medium">{active.kind === 'block' ? active.title : active.source.title}</p>
                            {active.kind === 'result' && (
                                <p className="truncate text-xs text-muted-foreground">
                                    {active.source.sourceLabel} · {active.source.resultLabel}
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </DragOverlay>
        </DndContext>
    );
}
