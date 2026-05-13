'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Database, FileSearch, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/registry/new-york-v4/ui/button';
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';
import { isSuccess } from '@/lib/result';
import type { LocalFileRelationManifest, LocalFilesInspectResponse } from '@dory/shared/types/local-files';

import { createLocalFiles, inspectLocalFiles } from '../api';

type LocalFilesDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
};

function defaultDatasetName(filePath: string) {
    const name = filePath
        .split(/[\\/]/)
        .filter(Boolean)
        .pop()
        ?.replace(/\.[^.]+$/, '');
    return name || 'Open Files';
}

export function LocalFilesDialog({ open, onOpenChange, onSuccess }: LocalFilesDialogProps) {
    const [filePath, setFilePath] = useState('');
    const [datasetName, setDatasetName] = useState('');
    const [inspectResult, setInspectResult] = useState<LocalFilesInspectResponse | null>(null);
    const [selectedRelations, setSelectedRelations] = useState<Set<string>>(new Set());
    const [inspecting, setInspecting] = useState(false);
    const [creating, setCreating] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const relations = inspectResult?.relations ?? [];
    const canCreate = Boolean(inspectResult && datasetName.trim() && selectedRelations.size > 0);

    const selectedRelationList = useMemo(() => {
        return relations.filter(relation => selectedRelations.has(relation.relationName));
    }, [relations, selectedRelations]);

    const reset = () => {
        setFilePath('');
        setDatasetName('');
        setInspectResult(null);
        setSelectedRelations(new Set());
        setInspecting(false);
        setCreating(false);
        setAdvancedOpen(false);
    };

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen && !creating && !inspecting) {
            reset();
        }
        onOpenChange(nextOpen);
    };

    const handleInspect = async () => {
        const trimmedPath = filePath.trim();
        if (!trimmedPath) {
            toast.error('Enter a server-accessible file path.');
            return;
        }
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

    const handleCreate = async () => {
        if (!inspectResult || !canCreate) return;
        setCreating(true);
        try {
            const result = await createLocalFiles({
                name: datasetName.trim(),
                source: {
                    backend: 'serverPath',
                    filePath: filePath.trim(),
                },
                relations: selectedRelationList,
            });
            if (!isSuccess(result)) {
                throw new Error(result.message || 'Failed to create Open Files dataset');
            }
            toast.success('Open Files dataset created.');
            onSuccess?.();
            handleOpenChange(false);
        } catch (error: any) {
            toast.error(error?.message ?? 'Failed to create Open Files dataset');
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
                        <Label htmlFor="local-files-path">File Path</Label>
                        <div className="flex gap-2">
                            <Input id="local-files-path" placeholder="/data/sales.xlsx" value={filePath} onChange={event => setFilePath(event.target.value)} />
                            <Button type="button" variant="secondary" onClick={handleInspect} disabled={inspecting || creating}>
                                {inspecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                                Preview
                            </Button>
                        </div>
                    </div>

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
                                        <Label htmlFor="local-files-dataset-name">Workspace Name</Label>
                                        <Input id="local-files-dataset-name" value={datasetName} onChange={event => setDatasetName(event.target.value)} />
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-sm font-medium">Customize table names</p>
                                        <div className="space-y-2">
                                            {relations.map(relation => (
                                                <div
                                                    key={`${relation.sheetName ?? relation.duckdbPath}:table-name`}
                                                    className="grid grid-cols-[minmax(0,1fr)_minmax(160px,220px)] items-center gap-3"
                                                >
                                                    <Label className="text-muted-foreground min-w-0 truncate text-sm font-normal">{relation.sheetName || relation.duckdbPath}</Label>
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
                    <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={creating || inspecting}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleCreate} disabled={!canCreate || creating || inspecting}>
                        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Open
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
