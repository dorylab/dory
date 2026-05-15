'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Database, FileSearch, FolderOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { isDesktopRuntime } from '@dory/shared/runtime';

import { Button } from '@/registry/new-york-v4/ui/button';
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';
import { isSuccess } from '@/lib/result';
import type { LocalFileRelationManifest, LocalFilesInspectResponse } from '@dory/shared/types/local-files';
import type { ConnectionListItem } from '@dory/shared/types/connections';

import { createLocalFiles, getLocalFilesDataset, inspectLocalFiles, updateLocalFiles } from '../api';

type LocalFilesDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
    mode?: 'create' | 'edit';
    connectionItem?: ConnectionListItem | null;
};

function defaultDatasetName(filePath: string) {
    const name = filePath
        .split(/[\\/]/)
        .filter(Boolean)
        .pop()
        ?.replace(/\.[^.]+$/, '');
    return name || 'Open Files';
}

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

function relationIdentity(relation: Pick<LocalFileRelationManifest, 'sourceType' | 'sheetName' | 'duckdbPath' | 'relationName'>) {
    return [relation.sourceType, relation.sheetName ?? '', relation.duckdbPath, relation.relationName].join('::');
}

function mergeInspectedRelationsWithSaved(inspectedRelations: LocalFileRelationManifest[], savedRelations: LocalFileRelationManifest[]) {
    const savedBySheet = new Map<string, LocalFileRelationManifest>();
    for (const relation of savedRelations) {
        savedBySheet.set(relation.sheetName ?? relation.duckdbPath, relation);
    }

    return inspectedRelations.map(relation => {
        const saved = savedBySheet.get(relation.sheetName ?? relation.duckdbPath);
        if (!saved) return relation;
        return {
            ...relation,
            relationName: saved.relationName,
            mode: saved.mode ?? relation.mode,
        };
    });
}

export function LocalFilesDialog({ open, onOpenChange, onSuccess, mode = 'create', connectionItem }: LocalFilesDialogProps) {
    const [filePath, setFilePath] = useState('');
    const [datasetName, setDatasetName] = useState('');
    const [datasetId, setDatasetId] = useState<string | null>(null);
    const [inspectResult, setInspectResult] = useState<LocalFilesInspectResponse | null>(null);
    const [selectedRelations, setSelectedRelations] = useState<Set<string>>(new Set());
    const [inspecting, setInspecting] = useState(false);
    const [creating, setCreating] = useState(false);
    const [loadingDataset, setLoadingDataset] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const canPickFile = isDesktopRuntime() && typeof window !== 'undefined' && typeof window.electron?.selectLocalFile === 'function';
    const relations = inspectResult?.relations ?? [];
    const isEditMode = mode === 'edit';
    const busy = inspecting || creating || loadingDataset;
    const canSave = Boolean(inspectResult && datasetName.trim() && selectedRelations.size > 0 && (!isEditMode || datasetId));

    const selectedRelationList = useMemo(() => {
        return relations.filter(relation => selectedRelations.has(relation.relationName));
    }, [relations, selectedRelations]);

    const reset = () => {
        setFilePath('');
        setDatasetName('');
        setDatasetId(null);
        setInspectResult(null);
        setSelectedRelations(new Set());
        setInspecting(false);
        setCreating(false);
        setLoadingDataset(false);
        setAdvancedOpen(false);
    };

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen && !busy) {
            reset();
        }
        onOpenChange(nextOpen);
    };

    useEffect(() => {
        if (!open || !isEditMode || !connectionItem?.connection?.id) return;

        let cancelled = false;
        setLoadingDataset(true);
        const options = parseConnectionOptions(connectionItem.connection.options);
        const optionDatasetId = typeof options.datasetId === 'string' ? options.datasetId : undefined;

        getLocalFilesDataset({
            connectionId: connectionItem.connection.id,
            datasetId: optionDatasetId,
        })
            .then(async result => {
                if (cancelled) return;
                if (!isSuccess(result) || !result.data) {
                    throw new Error(result.message || 'Failed to load Open Files dataset');
                }
                const inspectResult = await inspectLocalFiles({
                    source: {
                        backend: 'serverPath',
                        filePath: result.data.source.path,
                    },
                });
                if (cancelled) return;
                if (!isSuccess(inspectResult) || !inspectResult.data) {
                    throw new Error(inspectResult.message || 'Failed to inspect local file');
                }
                const relations = mergeInspectedRelationsWithSaved(inspectResult.data.relations, result.data.relations);
                const savedRelationKeys = new Set(result.data.relations.map(relation => relationIdentity(relation)));
                setDatasetId(result.data.dataset.id);
                setFilePath(result.data.source.path);
                setDatasetName(result.data.dataset.name);
                setInspectResult({
                    source: inspectResult.data.source,
                    relations,
                });
                setSelectedRelations(new Set(relations.filter(relation => savedRelationKeys.has(relationIdentity(relation))).map(relation => relation.relationName)));
                setAdvancedOpen(false);
            })
            .catch((error: any) => {
                if (!cancelled) {
                    toast.error(error?.message ?? 'Failed to load Open Files dataset');
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadingDataset(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [connectionItem?.connection?.id, connectionItem?.connection?.options, isEditMode, open]);

    const handleInspect = async (nextFilePath?: string) => {
        const trimmedPath = (nextFilePath ?? filePath).trim();
        if (!trimmedPath) {
            toast.error('Enter a server-accessible file path.');
            return;
        }
        setFilePath(trimmedPath);
        setInspecting(true);
        try {
            const result = await inspectLocalFiles({
                source: {
                    backend: 'serverPath',
                    filePath: trimmedPath,
                },
            });
            if (!isSuccess(result) || !result.data) {
                throw new Error(result.message || 'Failed to inspect local file');
            }
            setInspectResult(result.data);
            setDatasetName(current => current || defaultDatasetName(trimmedPath));
            setSelectedRelations(new Set(result.data.relations.map(relation => relation.relationName)));
            setAdvancedOpen(false);
        } catch (error: any) {
            toast.error(error?.message ?? 'Failed to inspect local file');
        } finally {
            setInspecting(false);
        }
    };

    const handleChooseFile = async () => {
        try {
            const selectedPath = await window.electron?.selectLocalFile?.();
            if (!selectedPath) {
                return;
            }
            await handleInspect(selectedPath);
        } catch (error: any) {
            toast.error(error?.message ?? 'Failed to choose local file');
        }
    };

    const updateRelation = (relationName: string, checked: boolean) => {
        setSelectedRelations(current => {
            const next = new Set(current);
            if (checked) {
                next.add(relationName);
            } else {
                next.delete(relationName);
            }
            return next;
        });
    };

    const updateRelationName = (relation: LocalFileRelationManifest, relationName: string) => {
        setInspectResult(current => {
            if (!current) return current;
            const nextRelations = current.relations.map(item => (item === relation ? { ...item, relationName } : item));
            const nextSelected = new Set<string>();
            for (const item of nextRelations) {
                const wasSelected = item === relation ? selectedRelations.has(relation.relationName) : selectedRelations.has(item.relationName);
                if (wasSelected) nextSelected.add(item.relationName);
            }
            setSelectedRelations(nextSelected);
            return {
                ...current,
                relations: nextRelations,
            };
        });
    };

    const handleSave = async () => {
        if (!inspectResult || !canSave) return;
        setCreating(true);
        try {
            const payload = {
                name: datasetName.trim(),
                source: {
                    backend: 'serverPath' as const,
                    filePath: filePath.trim(),
                },
                relations: selectedRelationList,
            };
            const result = isEditMode && datasetId ? await updateLocalFiles(datasetId, payload) : await createLocalFiles(payload);
            if (!isSuccess(result)) {
                throw new Error(result.message || `Failed to ${isEditMode ? 'update' : 'create'} Open Files dataset`);
            }
            toast.success(`Open Files dataset ${isEditMode ? 'updated' : 'created'}.`);
            onSuccess?.();
            reset();
            onOpenChange(false);
        } catch (error: any) {
            toast.error(error?.message ?? `Failed to ${isEditMode ? 'update' : 'create'} Open Files dataset`);
        } finally {
            setCreating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Open Files
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5">
                    <div className="space-y-2">
                        <Label htmlFor="local-files-dataset-name">Name</Label>
                        <Input id="local-files-dataset-name" value={datasetName} onChange={event => setDatasetName(event.target.value)} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="local-files-path">File Path</Label>
                        <div className="flex gap-2">
                            <Input id="local-files-path" placeholder="/data/sales.xlsx" value={filePath} onChange={event => setFilePath(event.target.value)} />
                            {canPickFile ? (
                                <Button type="button" variant="outline" onClick={handleChooseFile} disabled={busy}>
                                    <FolderOpen className="h-4 w-4" />
                                    Choose
                                </Button>
                            ) : null}
                            <Button type="button" variant="secondary" onClick={() => handleInspect()} disabled={busy}>
                                {inspecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                                Preview
                            </Button>
                        </div>
                    </div>

                    {loadingDataset ? (
                        <div className="text-muted-foreground flex items-center gap-2 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading Open Files dataset
                        </div>
                    ) : null}

                    {inspectResult ? (
                        <>
                            <div className="space-y-3">
                                <p className="text-sm font-medium">Found {relations.length.toLocaleString()} sheets in this file</p>
                                <div className="space-y-2">
                                    {relations.map(relation => (
                                        <Label key={`${relation.sheetName ?? relation.duckdbPath}:sheet`} className="flex min-w-0 items-center gap-3 text-sm font-normal">
                                            <Checkbox
                                                checked={selectedRelations.has(relation.relationName)}
                                                onCheckedChange={checked => updateRelation(relation.relationName, checked === true)}
                                            />
                                            <span className="min-w-0 truncate">{relation.sheetName || relation.duckdbPath}</span>
                                        </Label>
                                    ))}
                                </div>
                            </div>

                            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="border-border rounded-md border">
                                <CollapsibleTrigger asChild>
                                    <Button type="button" variant="ghost" className="group flex h-10 w-full justify-between px-3 text-sm font-medium">
                                        Advanced options
                                        <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="space-y-4 border-t px-3 py-3">
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium">Customize table names</p>
                                        <div className="space-y-2">
                                            {relations.map(relation => (
                                                <div
                                                    key={`${relation.sheetName ?? relation.duckdbPath}:table-name`}
                                                    className="grid grid-cols-[minmax(0,1fr)_minmax(160px,220px)] items-center gap-3"
                                                >
                                                    <Label className="text-muted-foreground min-w-0 truncate text-sm font-normal">
                                                        {relation.sheetName || relation.duckdbPath}
                                                    </Label>
                                                    <Input value={relation.relationName} onChange={event => updateRelationName(relation, event.target.value)} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        </>
                    ) : null}
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleSave} disabled={!canSave || busy}>
                        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {isEditMode ? 'Save Changes' : 'Open'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
