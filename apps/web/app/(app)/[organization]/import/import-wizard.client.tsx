'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ArrowDownToLine,
    ArrowLeft,
    ArrowRight,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Circle,
    Loader2,
    Plus,
    RefreshCw,
    Sparkles,
    Table2,
    Trash2,
    Upload,
    XCircle,
} from 'lucide-react';
import { useQueryStates } from 'nuqs';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { cn } from '@dory/web-utils';
import { useConnections } from '@/app/(app)/[organization]/connections/hooks/use-connections';
import { tableQueryKeys } from '@/app/(app)/[organization]/components/table-browser/components/table-queries';
import { X_CONNECTION_ID_KEY } from '@/app/config/app';
import { executeActionClient } from '@/lib/actions/client';
import { importEntryParsers, serializeImportEntry } from '@/lib/client/import-entry-query';
import { driverSupportsSchema } from '@/lib/explorer/capabilities';
import { Alert, AlertDescription, AlertTitle } from '@/registry/new-york-v4/ui/alert';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';
import { Progress } from '@/registry/new-york-v4/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Switch } from '@/registry/new-york-v4/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/registry/new-york-v4/ui/table';

type ImportColumnType = 'string' | 'boolean' | 'int64' | 'float64' | 'date' | 'datetime';
type ImportAtomicity = 'atomic' | 'best-effort';
type ImportWriteCapability =
    | { supported: true; atomicity: ImportAtomicity; reason?: 'batch_commits' | 'ddl_not_transactional' | 'target_non_transactional' }
    | { supported: false; reason: 'replace_not_atomic' | 'target_non_transactional' };
type ImportWriteCapabilities = Record<'create' | 'append' | 'replace', ImportWriteCapability>;
type CleaningOperation =
    | { kind: 'trim'; column: string }
    | { kind: 'lowercase'; column: string }
    | { kind: 'replace'; column: string; find: string; replacement: string }
    | { kind: 'emptyToNull'; column: string }
    | { kind: 'dropInvalid'; column: string; targetType: Exclude<ImportColumnType, 'string'>; dropNulls: boolean };
type TransformOperation =
    | CleaningOperation
    | { kind: 'rename'; source: string; target: string }
    | { kind: 'cast'; column: string; targetType: ImportColumnType }
    | { kind: 'ignore'; column: string };
export type ImportRunStatus = 'draft' | 'uploading' | 'analyzing' | 'ready' | 'queued' | 'running' | 'completed' | 'failed' | 'canceled' | 'commit_unknown';
type Profile = {
    version: 'dory.dataset-profile.v2';
    rows: number;
    sampleRows: number;
    columns: Array<{
        name: string;
        detectedType: ImportColumnType;
        nullCount: number;
        nullRate: number;
        emptyCount: number;
        emptyRate: number;
        whitespaceCount: number;
        whitespaceRate: number;
        sampleValues: string[];
        sample: { basis: 'sample'; rows: number; distinctCount: number; distinctRate: number; topValues: Array<{ value: string; count: number; rate: number }> };
        issues: Array<{
            code: 'all_missing' | 'empty_string' | 'surrounding_whitespace' | 'leading_zero' | 'mixed_type';
            severity: 'info' | 'warning';
            affectedCount: number;
            affectedRate: number;
            suggestedOperation?: Extract<CleaningOperation, { kind: 'trim' | 'emptyToNull' }>;
        }>;
    }>;
    preview: Array<Record<string, unknown>>;
    quality: { totalIssues: number; warningCount: number; infoCount: number; columnsWithIssues: number };
};
type Mapping = { source: string; target: string; targetType: ImportColumnType; ignored: boolean; order: number };
type Parsing = { delimiter: ',' | '\t' | ';' | '|'; hasHeader: boolean; encoding: string; quoteChar: string };
type SourceFormat = 'csv' | 'parquet' | 'ndjson' | 'arrow';
type SourceOptions = ({ format: 'csv' } & Parsing) | { format: 'parquet' } | { format: 'ndjson' } | { format: 'arrow' };
type ImportRun = {
    id: string;
    connectionId: string | null;
    status: ImportRunStatus;
    phase: string;
    sourceName: string | null;
    sourceExtension: string | null;
    sourceBytes: number | null;
    parsingOptions: SourceOptions | null;
    profile: Profile | null;
    plan: ImportPlan | null;
    progress: Record<string, unknown> | null;
    processedRows: number;
    filteredRows: number;
    pendingRows: number;
    insertedRows: number;
    batchCount: number;
    errorCode: string | null;
    errorMessage: string | null;
};
type Target = { mode: 'create' | 'existing'; database?: string; schema?: string; table: string };
type MetadataOption = { label?: string; value?: string; name?: string; schema?: string };
type SelectOption = { label: string; value: string };
type TableSelectOption = SelectOption & { table: string; schema?: string };
type TargetSchema = {
    exists: boolean;
    columns: Array<{ name: string; databaseType: string; importType: ImportColumnType; nullable: boolean; hasDefault: boolean }>;
    writeCapabilities: ImportWriteCapabilities;
};
type ImportPlanCommon = {
    target: Target;
    columns: Mapping[];
    mode: 'append' | 'replace';
    batchSize: number;
    transform: { version: 'dory.transform.v1'; operations: TransformOperation[] };
    sourceSchemaHash: string;
};
type ImportPlan = ImportPlanCommon & { version: 'dory.import-plan.v2'; source: SourceOptions };
type TransformPreview = {
    version: 'dory.transform-preview.v1';
    inputRows: number;
    keptRows: number;
    droppedRows: number;
    rows: Array<{
        sourceRow: number;
        before: Record<string, string | null>;
        after: Record<string, string | null>;
        outcome: 'kept' | 'dropped';
        errors: Array<{ column: string; code: 'invalid_type' | 'required_null'; targetType: ImportColumnType }>;
    }>;
};
type WizardTranslator = ReturnType<typeof useTranslations>;
type StepNavigation = { onBack: () => void; onContinue: () => void };
type WizardStepId = 'select' | 'preview' | 'target' | 'mapping' | 'clean' | 'options' | 'execute';

export type ImportWizardFixedTarget = {
    database: string;
    schema?: string;
    table: string;
};

type ImportWizardProps = {
    runId?: string;
    maxFileBytes: number;
    mode?: 'page' | 'table-modal';
    fixedTarget?: ImportWizardFixedTarget;
    onRunIdChange?: (runId: string) => void;
    onFinish?: () => void;
};

const COLUMN_TYPES: ImportColumnType[] = ['string', 'boolean', 'int64', 'float64', 'date', 'datetime'];
export const ACTIVE_IMPORT_RUN_STATUSES: ImportRunStatus[] = ['queued', 'running'];
export const TERMINAL_IMPORT_RUN_STATUSES: ImportRunStatus[] = ['completed', 'failed', 'canceled', 'commit_unknown'];
const WIZARD_TABLE_VIEWPORT_CLASS = 'h-[clamp(320px,48vh,480px)] overflow-hidden [&_[data-slot=table-container]]:h-full [&_[data-slot=table-container]]:overflow-auto';
const WIZARD_FILL_TABLE_VIEWPORT_CLASS = 'min-h-0 flex-1 overflow-hidden [&_[data-slot=table-container]]:h-full [&_[data-slot=table-container]]:overflow-auto';
const WIZARD_TABLE_HEADER_CLASS = 'sticky top-0 z-10 bg-background [&_tr]:bg-background';

const PAGE_STEPS: WizardStepId[] = ['select', 'preview', 'target', 'mapping', 'clean', 'options', 'execute'];
const TABLE_MODAL_STEPS: WizardStepId[] = ['select', 'preview', 'mapping', 'clean', 'options', 'execute'];

export function ImportWizard({ runId, maxFileBytes, mode = 'page', fixedTarget, onRunIdChange, onFinish }: ImportWizardProps) {
    const t = useTranslations('ImportWizard');
    const router = useRouter();
    const queryClient = useQueryClient();
    const params = useParams<{ organization: string; connectionId?: string }>();
    const organization = params.organization;
    const routeConnectionId = params.connectionId;
    const [entry] = useQueryStates(importEntryParsers);
    const connections = useConnections();
    const isTableModal = mode === 'table-modal';
    const stepIds = isTableModal ? TABLE_MODAL_STEPS : PAGE_STEPS;
    const [step, setStep] = useState<WizardStepId>('select');
    const [furthestStepIndex, setFurthestStepIndex] = useState(0);
    const [file, setFile] = useState<File | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [preparationStage, setPreparationStage] = useState<'idle' | 'uploading' | 'analyzing'>('idle');
    const [sourceOptions, setSourceOptions] = useState<SourceOptions | null>(null);
    const [target, setTarget] = useState<Target>({
        mode: fixedTarget || entry.table ? 'existing' : 'create',
        database: fixedTarget?.database ?? entry.database ?? undefined,
        schema: fixedTarget?.schema ?? entry.schema ?? undefined,
        table: fixedTarget?.table ?? entry.table ?? '',
    });
    const [targetSchema, setTargetSchema] = useState<TargetSchema | null>(null);
    const [mappings, setMappings] = useState<Mapping[]>([]);
    const [cleaningOperations, setCleaningOperations] = useState<CleaningOperation[]>([]);
    const [writeMode, setWriteMode] = useState<'append' | 'replace'>('append');
    const [batchSize, setBatchSize] = useState(1000);
    const [replaceConfirmed, setReplaceConfirmed] = useState(false);
    const hydratedRunRef = useRef<string | null>(null);

    const runQuery = useQuery({
        queryKey: ['import-run', runId],
        queryFn: () => api<ImportRun>(`/api/import-runs/${encodeURIComponent(runId!)}`),
        enabled: Boolean(runId),
        refetchInterval: query => {
            const status = query.state.data?.status;
            return status && (ACTIVE_IMPORT_RUN_STATUSES.includes(status) || status === 'analyzing' || status === 'uploading') ? 1000 : false;
        },
    });
    const run = runQuery.data;
    const connectionId = routeConnectionId ?? run?.connectionId ?? entry.connection ?? '';
    const selectedConnection = (connections.data ?? []).find(item => item.connection.id === connectionId)?.connection;
    const currentStepIndex = stepIds.indexOf(step);
    const previewStepIndex = stepIds.indexOf('preview');
    const targetLabel = [target.database, target.schema, target.table].filter(Boolean).join('.');
    const canResumeSource = Boolean(run && sourceOptions && (run.profile || run.phase === 'encoding_required'));
    const sourceOptionsNeedAnalysis = Boolean(run && sourceOptions && !sourceOptionsEqual(sourceOptions, run.parsingOptions));

    const getStepNumber = (stepId: WizardStepId) => stepIds.indexOf(stepId) + 1;

    useEffect(() => {
        if (currentStepIndex < 0) return;
        setFurthestStepIndex(current => Math.max(current, currentStepIndex));
    }, [currentStepIndex]);

    useEffect(() => {
        if (!run || hydratedRunRef.current === run.id) return;
        hydratedRunRef.current = run.id;
        const storedSourceOptions = run.parsingOptions;
        if (storedSourceOptions) setSourceOptions(storedSourceOptions);
        if (run.plan) {
            setTarget(isTableModal && fixedTarget ? { mode: 'existing', ...fixedTarget } : run.plan.target);
            setMappings(run.plan.columns);
            setCleaningOperations(run.plan.transform.operations.filter(isCleaningOperation));
            setWriteMode(run.plan.mode);
            setBatchSize(run.plan.batchSize);
        } else if (run.profile) {
            setMappings(defaultMappings(run.profile, null));
        }
        if (ACTIVE_IMPORT_RUN_STATUSES.includes(run.status) || TERMINAL_IMPORT_RUN_STATUSES.includes(run.status)) setStep('execute');
        else if (run.plan) setStep('options');
        else if (run.profile) setStep('preview');
        else if (run.phase === 'encoding_required') setStep('preview');
        else setStep('select');
    }, [fixedTarget, isTableModal, run]);

    useEffect(() => {
        if (!isTableModal || !fixedTarget || run?.plan) return;
        setTarget({ mode: 'existing', ...fixedTarget });
    }, [fixedTarget, isTableModal, run?.plan]);

    useEffect(() => {
        const scopedConnectionId = run?.connectionId ?? routeConnectionId ?? entry.connection;
        if (isTableModal || !scopedConnectionId || routeConnectionId === scopedConnectionId) return;
        const destination = run
            ? importRunPath(organization, scopedConnectionId, run.id)
            : serializeImportEntry(importPath(organization, scopedConnectionId), {
                  database: entry.database,
                  schema: entry.schema,
                  table: entry.table,
              });
        router.replace(destination);
    }, [entry.connection, entry.database, entry.schema, entry.table, isTableModal, organization, routeConnectionId, router, run]);

    const startMutation = useMutation({
        mutationFn: async () => {
            if (!file) throw new Error(t('Errors.FileRequired'));
            if (!connectionId) throw new Error(t('Errors.ConnectionMissing'));
            if (file.size > maxFileBytes) throw new Error(t('Errors.FileTooLarge', { limit: formatBytes(maxFileBytes) }));
            setPreparationStage('uploading');
            setUploadProgress(0);
            const created = await api<ImportRun>('/api/import-runs', { method: 'POST', headers: connectionHeaders(connectionId) });
            if (isTableModal) onRunIdChange?.(created.id);
            await uploadFile(created.id, file, setUploadProgress);
            setPreparationStage('analyzing');
            try {
                const analyzed = await api<ImportRun>(`/api/import-runs/${created.id}/analyze`, { method: 'POST', body: JSON.stringify({}) });
                return { run: analyzed, encodingRequired: false };
            } catch (error) {
                if (!(error instanceof ImportApiError) || error.importCode !== 'IMPORT_ENCODING_REQUIRED') throw error;
                const blocked = await api<ImportRun>(`/api/import-runs/${created.id}`);
                return { run: blocked, encodingRequired: true };
            }
        },
        onSuccess: result => {
            const analyzed = result.run;
            queryClient.setQueryData(['import-run', analyzed.id], analyzed);
            setSourceOptions(analyzed.parsingOptions);
            setMappings(analyzed.profile ? defaultMappings(analyzed.profile, null) : []);
            setCleaningOperations([]);
            setStep('preview');
            if (isTableModal) onRunIdChange?.(analyzed.id);
            else router.replace(importRunPath(organization, connectionId, analyzed.id));
            if (result.encodingRequired) toast.info(t('Preview.EncodingRequired'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.StartFailed')),
        onSettled: () => setPreparationStage('idle'),
    });

    const analyzeMutation = useMutation({
        mutationFn: () => api<ImportRun>(`/api/import-runs/${run!.id}/analyze`, { method: 'POST', body: JSON.stringify({ sourceOptions }) }),
        onSuccess: analyzed => {
            queryClient.setQueryData(['import-run', analyzed.id], analyzed);
            setSourceOptions(analyzed.parsingOptions);
            setMappings(defaultMappings(analyzed.profile!, null));
            setCleaningOperations([]);
            setTargetSchema(null);
            setFurthestStepIndex(previewStepIndex);
            toast.success(t('Preview.Reanalyzed'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.AnalysisFailed')),
    });

    const inspectMutation = useMutation({
        mutationFn: async () => {
            const schema = await api<TargetSchema>(`/api/import-runs/${run!.id}`, {
                method: 'PATCH',
                headers: connectionHeaders(connectionId),
                body: JSON.stringify({ action: 'inspect', target: normalizedTarget(target) }),
            });
            if (target.mode === 'existing' && !schema.exists) throw new Error(t('Errors.TargetMissing'));
            if (target.mode === 'create' && schema.exists) throw new Error(t('Errors.TargetExists'));
            const latestProfile = queryClient.getQueryData<ImportRun>(['import-run', run!.id])?.profile ?? run!.profile;
            if (!latestProfile) throw new Error(t('Errors.PlanIncomplete'));
            return { schema, profile: latestProfile };
        },
        onSuccess: ({ schema, profile }) => {
            setTargetSchema(schema);
            setMappings(defaultMappings(profile, target.mode === 'existing' ? schema : null));
            if (!schema.writeCapabilities.replace.supported) {
                setWriteMode('append');
                setReplaceConfirmed(false);
            }
            setStep('mapping');
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.TargetFailed')),
    });

    const resumedTargetQuery = useQuery({
        queryKey: ['import-target-capabilities', run?.id, connectionId, run?.plan?.target],
        queryFn: () =>
            api<TargetSchema>(`/api/import-runs/${run!.id}`, {
                method: 'PATCH',
                headers: connectionHeaders(connectionId),
                body: JSON.stringify({ action: 'inspect', target: run!.plan!.target }),
            }),
        enabled: Boolean(run?.plan && step === 'options' && !targetSchema && connectionId),
        staleTime: 0,
        retry: false,
    });

    const transformDraftKey = JSON.stringify({ sourceOptions, mappings, cleaningOperations, target, writeMode, batchSize });
    const transformPreviewQuery = useQuery({
        queryKey: ['import-transform-preview', run?.id, transformDraftKey],
        queryFn: ({ signal }) =>
            api<TransformPreview>(`/api/import-runs/${run!.id}/transform-preview`, {
                method: 'POST',
                signal,
                body: JSON.stringify({ plan: buildPlan() }),
            }),
        enabled: step === 'clean' && Boolean(run && sourceOptions) && !sourceOptionsNeedAnalysis && cleaningOperationsValid(cleaningOperations),
        staleTime: Infinity,
        retry: false,
    });

    const saveCleanMutation = useMutation({
        mutationFn: () =>
            api<{ run: ImportRun; target: TargetSchema; createSql: string | null }>(`/api/import-runs/${run!.id}`, {
                method: 'PATCH',
                headers: connectionHeaders(connectionId),
                body: JSON.stringify({ plan: buildPlan() }),
            }),
        onSuccess: result => {
            queryClient.setQueryData(['import-run', result.run.id], result.run);
            setStep('options');
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.SaveFailed')),
    });

    const savePlanMutation = useMutation({
        mutationFn: () =>
            api<{ run: ImportRun; target: TargetSchema; createSql: string | null }>(`/api/import-runs/${run!.id}`, {
                method: 'PATCH',
                headers: connectionHeaders(connectionId),
                body: JSON.stringify({ plan: buildPlan() }),
            }),
        onSuccess: result => {
            queryClient.setQueryData(['import-run', result.run.id], result.run);
            setStep('execute');
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.SaveFailed')),
    });

    const executeMutation = useMutation({
        mutationFn: () => api<ImportRun>(`/api/import-runs/${run!.id}/execute`, { method: 'POST', headers: connectionHeaders(connectionId) }),
        onSuccess: queued => {
            queryClient.setQueryData(['import-run', queued.id], queued);
            void queryClient.invalidateQueries({ queryKey: ['import-run', queued.id] });
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.ExecuteFailed')),
    });

    const cancelMutation = useMutation({
        mutationFn: () => api<ImportRun>(`/api/import-runs/${run!.id}/cancel`, { method: 'POST' }),
        onSuccess: canceled => queryClient.setQueryData(['import-run', canceled.id], canceled),
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.CancelFailed')),
    });

    useEffect(() => {
        if (run?.status !== 'completed') return;
        const completedTarget = run.plan?.target ?? target;
        const completedTableName = [completedTarget.schema, completedTarget.table].filter(Boolean).join('.');

        void queryClient.invalidateQueries({ queryKey: ['explorer'] });
        void queryClient.invalidateQueries({ queryKey: ['table-preview'] });
        void queryClient.invalidateQueries({ queryKey: ['schema'] });
        void queryClient.invalidateQueries({ queryKey: ['catalog-db-group'] });
        void queryClient.invalidateQueries({ queryKey: ['schema-graph'] });
        void queryClient.invalidateQueries({ queryKey: ['schema-graph-schemas'] });
        if (connectionId && completedTarget.database && completedTableName) {
            void queryClient.invalidateQueries({ queryKey: tableQueryKeys.properties(connectionId, completedTarget.database, completedTableName) });
            void queryClient.invalidateQueries({ queryKey: tableQueryKeys.stats(connectionId, completedTarget.database, completedTableName) });
        }
    }, [connectionId, queryClient, run?.plan, run?.status, target]);

    const stepLabels: Record<WizardStepId, string> = {
        select: t('Steps.Select'),
        preview: t('Steps.Preview'),
        target: t('Steps.Target'),
        mapping: t('Steps.Mapping'),
        clean: t('Steps.Clean'),
        options: t('Steps.Options'),
        execute: t('Steps.Execute'),
    };
    const profile = run?.profile;
    const writtenRows = getWrittenRows(run);
    const preparedRows = run?.progress?.preparedRows;
    const totalRows = typeof preparedRows === 'number' ? preparedRows : (profile?.rows ?? writtenRows);
    const progressPercent = totalRows > 0 ? Math.min(100, (writtenRows / totalRows) * 100) : 0;
    const resolvedTargetSchema = targetSchema ?? resumedTargetQuery.data ?? null;
    const writeCapability = resolvedTargetSchema?.writeCapabilities[target.mode === 'create' ? 'create' : writeMode] ?? readWriteCapability(run?.progress?.writeCapability) ?? null;

    function buildPlan(): ImportPlan {
        if (!run || !sourceOptions) throw new Error(t('Errors.PlanIncomplete'));
        const sourceSchemaHash = String(run.progress?.schemaHash ?? '');
        if (!/^[a-f0-9]{64}$/.test(sourceSchemaHash)) throw new Error(t('Errors.PlanIncomplete'));
        const operations: TransformOperation[] = cleaningOperations.map(operation => {
            if (operation.kind !== 'dropInvalid') return operation;
            const mapping = mappings.find(column => column.source === operation.column);
            return mapping && mapping.targetType !== 'string' ? { ...operation, targetType: mapping.targetType } : operation;
        });
        for (const mapping of mappings) {
            if (mapping.ignored) operations.push({ kind: 'ignore', column: mapping.source });
            else {
                if (mapping.source !== mapping.target) operations.push({ kind: 'rename', source: mapping.source, target: mapping.target });
                operations.push({ kind: 'cast', column: mapping.target, targetType: mapping.targetType });
            }
        }
        return {
            version: 'dory.import-plan.v2',
            source: sourceOptions,
            target: normalizedTarget(target),
            columns: mappings,
            mode: target.mode === 'create' ? 'append' : writeMode,
            batchSize,
            transform: { version: 'dory.transform.v1', operations },
            sourceSchemaHash,
        };
    }

    function applySuggestedOperation(operation: Extract<CleaningOperation, { kind: 'trim' | 'emptyToNull' }>) {
        setCleaningOperations(current => (current.some(item => item.kind === operation.kind && item.column === operation.column) ? current : [...current, operation]));
        toast.success(t('Quality.FixAdded'));
    }

    async function continueFromPreview() {
        if (sourceOptionsNeedAnalysis) {
            try {
                await analyzeMutation.mutateAsync();
            } catch {
                return;
            }
        }
        if (isTableModal) inspectMutation.mutate();
        else setStep('target');
    }

    return (
        <div className={cn('h-full min-h-0 overflow-auto lg:overflow-hidden', !isTableModal && 'bg-n8')}>
            <main className={cn('grid min-h-full grid-cols-1 lg:h-full lg:min-h-0', isTableModal ? 'lg:grid-cols-[220px_minmax(0,1fr)]' : 'lg:grid-cols-[250px_minmax(0,1fr)]')}>
                <aside
                    className={cn(
                        'border-b border-border/70 px-5 py-7 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0',
                        isTableModal ? 'lg:px-5 lg:py-6' : 'lg:px-6 lg:py-9',
                    )}
                >
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <ArrowDownToLine className="size-4 text-primary" />
                        {t('Eyebrow')}
                    </div>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t('Title')}</h1>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('Description')}</p>
                    {isTableModal ? (
                        <div className="mt-5 border-y border-border/70 py-4">
                            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t('Modal.Target')}</p>
                            <p className="mt-1 break-all text-sm font-medium">{targetLabel}</p>
                        </div>
                    ) : null}
                    <ol className="mt-7 grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-1">
                        {stepIds.map((stepId, index) => {
                            const label = stepLabels[stepId];
                            const number = index + 1;
                            const active = step === stepId;
                            const blockedByParsingChange = sourceOptionsNeedAnalysis && index > previewStepIndex;
                            const complete = !blockedByParsingChange && (furthestStepIndex > index || (stepId === 'execute' && run?.status === 'completed'));
                            return (
                                <li key={stepId}>
                                    <button
                                        type="button"
                                        disabled={index > furthestStepIndex || (index > 0 && !run) || blockedByParsingChange}
                                        onClick={() => setStep(stepId)}
                                        className={cn(
                                            'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors lg:text-sm',
                                            active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                                            'disabled:pointer-events-none disabled:opacity-40',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px]',
                                                complete && 'border-primary bg-primary text-primary-foreground',
                                                active && !complete && 'border-foreground',
                                            )}
                                        >
                                            {complete ? <Check className="size-3" /> : number}
                                        </span>
                                        <span className="truncate">{label}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                </aside>

                <section className={cn('min-h-0 min-w-0 overflow-y-auto px-4 py-7 sm:px-5', isTableModal ? 'lg:px-6 lg:py-7' : 'lg:px-7 lg:py-10')}>
                    <div className="min-h-full w-full lg:h-full lg:min-h-0">
                        {step === 'select' && (!runId || run || startMutation.isPending) ? (
                            <SelectFileStep
                                t={t}
                                stepNumber={getStepNumber('select')}
                                file={file}
                                run={run}
                                stage={preparationStage !== 'idle' ? preparationStage : run?.status === 'uploading' || run?.status === 'analyzing' ? run.status : 'idle'}
                                sourceLocked={Boolean(run?.sourceName)}
                                onFile={setFile}
                                uploadProgress={uploadProgress}
                                maxFileBytes={maxFileBytes}
                                pending={startMutation.isPending || run?.status === 'uploading' || run?.status === 'analyzing'}
                                canContinue={canResumeSource || Boolean(file && connectionId && file.size <= maxFileBytes)}
                                continueLabel={canResumeSource ? t('Common.Next') : t('Select.Analyze')}
                                onContinue={() => (canResumeSource ? setStep('preview') : startMutation.mutate())}
                            />
                        ) : null}
                        {step === 'preview' && profile && sourceOptions ? (
                            <PreviewStep
                                t={t}
                                stepNumber={getStepNumber('preview')}
                                profile={profile}
                                onApplyFix={applySuggestedOperation}
                                sourceOptions={sourceOptions}
                                onSourceOptions={setSourceOptions}
                                sourceOptionsNeedAnalysis={sourceOptionsNeedAnalysis}
                                sourceWarnings={readSourceWarnings(run?.progress?.sourceWarnings)}
                                sourceSchema={readSourceSchema(run?.progress?.sourceSchema)}
                                reanalyzing={analyzeMutation.isPending}
                                onReanalyze={() => analyzeMutation.mutate()}
                                continuePending={analyzeMutation.isPending || inspectMutation.isPending}
                                onBack={() => setStep('select')}
                                onContinue={() => void continueFromPreview()}
                            />
                        ) : null}
                        {step === 'preview' && !profile && sourceOptions?.format === 'csv' ? (
                            <EncodingSelectionStep
                                t={t}
                                stepNumber={getStepNumber('preview')}
                                parsing={sourceOptions}
                                onParsing={value => setSourceOptions({ format: 'csv', ...value })}
                                reanalyzing={analyzeMutation.isPending}
                                onReanalyze={() => analyzeMutation.mutate()}
                                onBack={() => setStep('select')}
                            />
                        ) : null}
                        {step === 'target' && run && !isTableModal ? (
                            <TargetStep
                                t={t}
                                stepNumber={getStepNumber('target')}
                                target={target}
                                onTarget={setTarget}
                                connectionId={connectionId}
                                connectionType={selectedConnection?.type ?? ''}
                                connectionDatabase={selectedConnection?.database ?? undefined}
                                pending={inspectMutation.isPending}
                                onBack={() => setStep('preview')}
                                onContinue={() => inspectMutation.mutate()}
                            />
                        ) : null}
                        {step === 'mapping' && profile ? (
                            <MappingStep
                                t={t}
                                stepNumber={getStepNumber('mapping')}
                                mappings={mappings}
                                onMappings={setMappings}
                                targetMode={target.mode}
                                targetSchema={targetSchema}
                                onBack={() => setStep(isTableModal ? 'preview' : 'target')}
                                onContinue={() => setStep('clean')}
                            />
                        ) : null}
                        {step === 'clean' && profile ? (
                            <CleanDataStep
                                t={t}
                                stepNumber={getStepNumber('clean')}
                                profile={profile}
                                mappings={mappings}
                                targetSchema={targetSchema}
                                operations={cleaningOperations}
                                onOperations={setCleaningOperations}
                                preview={transformPreviewQuery.data}
                                previewPending={transformPreviewQuery.isFetching}
                                previewError={transformPreviewQuery.error instanceof Error ? transformPreviewQuery.error.message : null}
                                pending={saveCleanMutation.isPending}
                                onBack={() => setStep('mapping')}
                                onContinue={() => saveCleanMutation.mutate()}
                            />
                        ) : null}
                        {step === 'options' ? (
                            <OptionsStep
                                t={t}
                                stepNumber={getStepNumber('options')}
                                target={target}
                                writeMode={writeMode}
                                onWriteMode={(value: 'append' | 'replace') => {
                                    setWriteMode(value);
                                    setReplaceConfirmed(false);
                                }}
                                batchSize={batchSize}
                                onBatchSize={setBatchSize}
                                replaceConfirmed={replaceConfirmed}
                                onReplaceConfirmed={setReplaceConfirmed}
                                writeCapability={writeCapability}
                                replaceCapability={resolvedTargetSchema?.writeCapabilities.replace ?? null}
                                pending={savePlanMutation.isPending}
                                onBack={() => setStep('clean')}
                                onContinue={() => savePlanMutation.mutate()}
                            />
                        ) : null}
                        {step === 'execute' && run ? (
                            <ExecuteStep
                                t={t}
                                stepNumber={getStepNumber('execute')}
                                run={run}
                                writeCapability={writeCapability}
                                totalRows={totalRows}
                                writtenRows={writtenRows}
                                progressPercent={progressPercent}
                                executePending={executeMutation.isPending}
                                cancelPending={cancelMutation.isPending}
                                onExecute={() => executeMutation.mutate()}
                                onCancel={() => cancelMutation.mutate()}
                                onBack={() => setStep('options')}
                                allowTerminalDismiss={isTableModal}
                                onFinish={onFinish ?? (() => router.replace(`/${encodeURIComponent(organization)}/connections`))}
                            />
                        ) : null}
                        {runQuery.isLoading && !startMutation.isPending ? (
                            <div className="flex min-h-80 items-center justify-center text-muted-foreground">
                                <Loader2 className="mr-2 size-4 animate-spin" />
                                {t('Loading')}
                            </div>
                        ) : null}
                    </div>
                </section>
            </main>
        </div>
    );
}

function StepHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
    return (
        <header className="mb-8 shrink-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </header>
    );
}

function StepActions({
    back,
    backLabel,
    next,
    nextLabel,
    disabled,
    pending,
    secondary,
}: {
    back?: () => void;
    backLabel?: string;
    next: () => void;
    nextLabel: string;
    disabled?: boolean;
    pending?: boolean;
    secondary?: {
        label: string;
        onClick: () => void;
        disabled?: boolean;
        pending?: boolean;
        icon?: ReactNode;
    };
}) {
    return (
        <div className="mt-8 flex shrink-0 items-center justify-between border-t pt-5">
            {back ? (
                <Button variant="ghost" onClick={back}>
                    <ArrowLeft />
                    {backLabel}
                </Button>
            ) : (
                <span />
            )}
            <div className="flex items-center gap-2">
                {secondary ? (
                    <Button variant="outline" onClick={secondary.onClick} disabled={secondary.disabled || secondary.pending}>
                        {secondary.pending ? <Loader2 className="animate-spin" /> : secondary.icon}
                        {secondary.label}
                    </Button>
                ) : null}
                <Button onClick={next} disabled={disabled || pending}>
                    {pending ? <Loader2 className="animate-spin" /> : null}
                    {nextLabel}
                    <ArrowRight />
                </Button>
            </div>
        </div>
    );
}

function SelectFileStep({
    t,
    stepNumber,
    file,
    run,
    stage,
    sourceLocked,
    onFile,
    uploadProgress,
    maxFileBytes,
    pending,
    canContinue,
    continueLabel,
    onContinue,
}: {
    t: WizardTranslator;
    stepNumber: number;
    file: File | null;
    run?: ImportRun;
    stage: 'idle' | 'uploading' | 'analyzing';
    sourceLocked: boolean;
    onFile: (file: File | null) => void;
    uploadProgress: number;
    maxFileBytes: number;
    pending: boolean;
    canContinue: boolean;
    continueLabel: string;
    onContinue: () => void;
}) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const displayName = file?.name ?? run?.sourceName;
    const displaySize = file?.size ?? run?.sourceBytes;
    const displayFormat = sourceFormatForFileName(displayName ?? '', run?.sourceExtension);
    const analyzing = stage === 'analyzing';

    return (
        <>
            <StepHeader eyebrow={t('Step', { number: stepNumber })} title={t('Select.Title')} description={t('Select.Description')} />
            <div className="grid gap-6">
                <button
                    type="button"
                    disabled={pending || sourceLocked}
                    onClick={() => inputRef.current?.click()}
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => {
                        event.preventDefault();
                        if (pending || sourceLocked) return;
                        onFile(event.dataTransfer.files[0] ?? null);
                    }}
                    className={cn(
                        'group flex min-h-72 w-full flex-col items-center justify-center border border-dashed border-border bg-muted/20 px-8 text-center transition-colors hover:border-foreground/40 hover:bg-muted/35 disabled:hover:border-border disabled:hover:bg-muted/20',
                        pending ? 'disabled:cursor-wait' : 'disabled:cursor-default',
                    )}
                >
                    <span className="flex size-12 items-center justify-center rounded-full border bg-background">
                        <Upload className="size-5" />
                    </span>
                    <span className="mt-4 text-base font-medium">{displayName ?? t('Select.Drop')}</span>
                    {displayFormat ? (
                        <Badge variant="outline" className="mt-2">
                            {t(`Formats.${displayFormat}`)}
                        </Badge>
                    ) : null}
                    <span className="mt-1 text-sm text-muted-foreground">
                        {displaySize != null ? formatBytes(displaySize) : t('Select.Limit', { limit: formatBytes(maxFileBytes) })}
                    </span>
                    <input
                        ref={inputRef}
                        type="file"
                        disabled={pending || sourceLocked}
                        accept=".csv,.tsv,.parquet,.ndjson,.jsonl,.arrow,.ipc,.feather,text/csv,text/tab-separated-values,application/x-ndjson,application/vnd.apache.parquet,application/vnd.apache.arrow.file"
                        className="hidden"
                        onChange={event => onFile(event.target.files?.[0] ?? null)}
                    />
                </button>
                {pending ? (
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-2">
                                {analyzing ? <Loader2 className="size-3.5 animate-spin" /> : null}
                                {analyzing ? t('Select.UploadCompleteAnalyzing') : t('Select.Uploading')}
                            </span>
                            <span>{analyzing ? 100 : uploadProgress}%</span>
                        </div>
                        <Progress value={analyzing ? 100 : uploadProgress} />
                    </div>
                ) : null}
            </div>
            <StepActions next={onContinue} nextLabel={continueLabel} disabled={!canContinue} pending={pending} />
        </>
    );
}

function PreviewStep({
    t,
    stepNumber,
    profile,
    onApplyFix,
    sourceOptions,
    onSourceOptions,
    sourceOptionsNeedAnalysis,
    sourceWarnings,
    sourceSchema,
    reanalyzing,
    continuePending,
    onReanalyze,
    onBack,
    onContinue,
}: {
    t: WizardTranslator;
    stepNumber: number;
    profile: Profile;
    onApplyFix: (operation: Extract<CleaningOperation, { kind: 'trim' | 'emptyToNull' }>) => void;
    sourceOptions: SourceOptions;
    onSourceOptions: (sourceOptions: SourceOptions) => void;
    sourceOptionsNeedAnalysis: boolean;
    sourceWarnings: Array<{ code: 'DECIMAL_STRINGIFIED'; column: string; sourceType: string }>;
    sourceSchema: Array<{ name: string; sourceType: string; importType: ImportColumnType }>;
    reanalyzing: boolean;
    continuePending: boolean;
    onReanalyze: () => void;
} & StepNavigation) {
    const sourceTypeByColumn = useMemo(() => new Map(sourceSchema.map(column => [column.name, column.sourceType])), [sourceSchema]);
    return (
        <div className="flex min-h-full flex-col xl:h-full xl:min-h-0">
            <StepHeader
                eyebrow={t('Step', { number: stepNumber })}
                title={t('Preview.Title')}
                description={t('Preview.Description', { rows: profile.rows, columns: profile.columns.length })}
            />
            <div className="grid gap-6 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="flex h-[clamp(320px,48vh,480px)] min-w-0 flex-col border xl:h-auto xl:min-h-0">
                    <div className="flex items-center justify-between border-b px-4 py-3">
                        <span className="text-sm font-medium">{t('Preview.Rows')}</span>
                        <Badge variant="secondary">100</Badge>
                    </div>
                    <div className={WIZARD_FILL_TABLE_VIEWPORT_CLASS}>
                        <Table>
                            <TableHeader className={WIZARD_TABLE_HEADER_CLASS}>
                                <TableRow>
                                    {profile.columns.map(column => (
                                        <TableHead key={column.name} className="whitespace-nowrap">
                                            {column.name}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {profile.preview.map((row, index) => (
                                    <TableRow key={index}>
                                        {profile.columns.map(column => (
                                            <TableCell key={column.name} className="max-w-64 truncate whitespace-nowrap font-mono text-xs">
                                                {row[column.name] === null ? <span className="text-muted-foreground">NULL</span> : String(row[column.name] ?? '')}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
                <div className="grid h-[clamp(480px,65vh,640px)] grid-rows-[minmax(0,1fr)_auto] gap-6 xl:h-auto xl:min-h-0">
                    <section className="flex min-h-0 flex-col">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-medium">{t('Preview.Schema')}</h3>
                            <Badge variant={profile.quality.warningCount > 0 ? 'destructive' : 'secondary'}>
                                {t('Quality.IssueCount', { count: profile.quality.totalIssues })}
                            </Badge>
                        </div>
                        <div className="mt-3 min-h-0 flex-1 divide-y overflow-y-auto border-y">
                            {profile.columns.map(column => (
                                <div key={column.name} className="py-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="truncate text-sm">{column.name}</span>
                                        <Badge variant="outline">{t(`Types.${column.detectedType}`)}</Badge>
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {sourceTypeByColumn.has(column.name) ? `${t('Preview.NativeType', { type: sourceTypeByColumn.get(column.name) ?? '' })} · ` : null}
                                        {t('Quality.Completeness', { rate: ((1 - column.nullRate) * 100).toFixed(1) })} ·{' '}
                                        {t('Preview.NullRate', { rate: (column.nullRate * 100).toFixed(1) })} ·{' '}
                                        {t('Quality.EmptyRate', { rate: (column.emptyRate * 100).toFixed(1) })} ·{' '}
                                        {t('Quality.DistinctSample', { count: column.sample.distinctCount })}
                                    </p>
                                    {column.issues.length ? (
                                        <div className="mt-2 space-y-1.5">
                                            {column.issues.map(issue => (
                                                <div key={issue.code} className="flex items-center gap-2 text-xs">
                                                    <Badge variant={issue.severity === 'warning' ? 'destructive' : 'secondary'}>{t(`Quality.Issues.${issue.code}`)}</Badge>
                                                    <span className="text-muted-foreground">{formatNumber(issue.affectedCount)}</span>
                                                    {issue.suggestedOperation ? (
                                                        <Button size="xs" variant="ghost" className="ml-auto" onClick={() => onApplyFix(issue.suggestedOperation!)}>
                                                            <Sparkles />
                                                            {t('Quality.ApplyFix')}
                                                        </Button>
                                                    ) : null}
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </section>
                    <section className="shrink-0 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-medium">{sourceOptions.format === 'csv' ? t('Preview.Parsing') : t('Preview.SourceFormat')}</h3>
                            <Badge variant="outline">{t(`Formats.${sourceOptions.format}`)}</Badge>
                        </div>
                        {sourceWarnings.map(warning => (
                            <Alert key={`${warning.code}:${warning.column}`}>
                                <AlertTitle>{t(`SourceWarnings.${warning.code}.Title`, { column: warning.column })}</AlertTitle>
                                <AlertDescription>{t(`SourceWarnings.${warning.code}.Description`, { column: warning.column, sourceType: warning.sourceType })}</AlertDescription>
                            </Alert>
                        ))}
                        {sourceOptions.format === 'csv' ? (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="min-w-0 space-y-2">
                                        <Label>{t('Preview.Delimiter')}</Label>
                                        <Select
                                            value={sourceOptions.delimiter}
                                            onValueChange={(value: Parsing['delimiter']) => onSourceOptions({ ...sourceOptions, delimiter: value })}
                                        >
                                            <SelectTrigger className="w-full min-w-0">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value=",">{t('Delimiters.Comma')}</SelectItem>
                                                <SelectItem value="\t">{t('Delimiters.Tab')}</SelectItem>
                                                <SelectItem value=";">{t('Delimiters.Semicolon')}</SelectItem>
                                                <SelectItem value="|">{t('Delimiters.Pipe')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="min-w-0 space-y-2">
                                        <Label>{t('Preview.Encoding')}</Label>
                                        <Select value={sourceOptions.encoding} onValueChange={(value: string) => onSourceOptions({ ...sourceOptions, encoding: value })}>
                                            <SelectTrigger className="w-full min-w-0">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {['utf8', 'utf16le', 'utf16be', 'gb18030', 'big5', 'shift_jis', 'windows1252'].map(value => (
                                                    <SelectItem key={value} value={value}>
                                                        {value}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <Label>{t('Preview.Header')}</Label>
                                    <Switch checked={sourceOptions.hasHeader} onCheckedChange={(value: boolean) => onSourceOptions({ ...sourceOptions, hasHeader: value })} />
                                </div>
                                {sourceOptionsNeedAnalysis ? (
                                    <Alert>
                                        <RefreshCw />
                                        <AlertTitle>{t('Preview.ParsingChangedTitle')}</AlertTitle>
                                        <AlertDescription>{t('Preview.ParsingChangedDescription')}</AlertDescription>
                                    </Alert>
                                ) : null}
                            </>
                        ) : (
                            <p className="text-xs leading-5 text-muted-foreground">{t('Preview.TypedSourceDescription')}</p>
                        )}
                    </section>
                </div>
            </div>
            <StepActions
                back={onBack}
                backLabel={t('Common.Back')}
                next={onContinue}
                nextLabel={t('Common.Next')}
                disabled={reanalyzing}
                pending={continuePending}
                secondary={
                    sourceOptions.format === 'csv'
                        ? {
                              label: t('Preview.Reanalyze'),
                              onClick: onReanalyze,
                              disabled: continuePending,
                              pending: reanalyzing,
                              icon: <RefreshCw />,
                          }
                        : undefined
                }
            />
        </div>
    );
}

function EncodingSelectionStep({
    t,
    stepNumber,
    parsing,
    onParsing,
    reanalyzing,
    onReanalyze,
    onBack,
}: {
    t: WizardTranslator;
    stepNumber: number;
    parsing: Parsing;
    onParsing: (parsing: Parsing) => void;
    reanalyzing: boolean;
    onReanalyze: () => void;
    onBack: () => void;
}) {
    return (
        <>
            <StepHeader eyebrow={t('Step', { number: stepNumber })} title={t('Preview.EncodingTitle')} description={t('Preview.EncodingDescription')} />
            <div className="max-w-md space-y-5">
                <div className="space-y-2">
                    <Label>{t('Preview.Encoding')}</Label>
                    <Select value={parsing.encoding} onValueChange={(value: string) => onParsing({ ...parsing, encoding: value })}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {['utf8', 'utf16le', 'utf16be', 'gb18030', 'big5', 'shift_jis', 'windows1252'].map(value => (
                                <SelectItem key={value} value={value}>
                                    {value}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <Alert>
                    <RefreshCw />
                    <AlertTitle>{t('Preview.EncodingRequired')}</AlertTitle>
                    <AlertDescription>{t('Preview.EncodingHelp')}</AlertDescription>
                </Alert>
            </div>
            <StepActions back={onBack} backLabel={t('Common.Back')} next={onReanalyze} nextLabel={t('Preview.Reanalyze')} pending={reanalyzing} />
        </>
    );
}

function TargetStep({
    t,
    stepNumber,
    target,
    onTarget,
    connectionId,
    connectionType,
    connectionDatabase,
    pending,
    onBack,
    onContinue,
}: {
    t: WizardTranslator;
    stepNumber: number;
    target: Target;
    onTarget: (target: Target) => void;
    connectionId: string;
    connectionType: string;
    connectionDatabase?: string;
    pending: boolean;
} & StepNavigation) {
    const databasesQuery = useQuery({
        queryKey: ['import-target-metadata', 'databases', connectionId],
        queryFn: ({ signal }) => executeActionClient<{ databases: MetadataOption[] }>('schema.listDatabases', { connectionId }, { currentConnectionId: connectionId, signal }),
        enabled: Boolean(connectionId),
        staleTime: 5 * 60_000,
    });
    const databaseOptions = useMemo(() => normalizeSelectOptions(databasesQuery.data?.databases), [databasesQuery.data?.databases]);
    const selectedDatabase = target.database?.trim() ?? '';
    const supportsSchemas = driverSupportsSchema(connectionType);

    const schemasQuery = useQuery({
        queryKey: ['import-target-metadata', 'schemas', connectionId, selectedDatabase],
        queryFn: ({ signal }) =>
            executeActionClient<MetadataOption[]>('schema.listSchemas', { connectionId, database: selectedDatabase }, { currentConnectionId: connectionId, signal }),
        enabled: Boolean(connectionId && selectedDatabase && supportsSchemas),
        staleTime: 5 * 60_000,
    });
    const schemaOptions = useMemo(() => normalizeSelectOptions(schemasQuery.data), [schemasQuery.data]);

    const tablesQuery = useQuery({
        queryKey: ['import-target-metadata', 'tables', connectionId, selectedDatabase],
        queryFn: ({ signal }) =>
            executeActionClient<{ tables: MetadataOption[] }>('schema.listTables', { connectionId, database: selectedDatabase }, { currentConnectionId: connectionId, signal }),
        enabled: Boolean(connectionId && selectedDatabase && target.mode === 'existing'),
        staleTime: 60_000,
    });
    const allTableOptions = useMemo(() => normalizeTableOptions(tablesQuery.data?.tables, supportsSchemas), [supportsSchemas, tablesQuery.data?.tables]);
    const tableOptions = useMemo(
        () => (supportsSchemas && target.schema ? allTableOptions.filter(option => option.schema === target.schema) : allTableOptions),
        [allTableOptions, supportsSchemas, target.schema],
    );
    const selectedTableValue = tableOptions.find(option => option.table === target.table && (!supportsSchemas || option.schema === target.schema))?.value ?? '';

    useEffect(() => {
        if (!databaseOptions.length) return;
        if (selectedDatabase && databaseOptions.some(option => option.value === selectedDatabase)) return;

        const preferred = databaseOptions.find(option => option.value === connectionDatabase) ?? databaseOptions[0];
        if (!preferred) return;
        onTarget({
            ...target,
            database: preferred.value,
            schema: supportsSchemas ? target.schema : undefined,
            table: target.mode === 'existing' ? '' : target.table,
        });
    }, [connectionDatabase, databaseOptions, onTarget, selectedDatabase, supportsSchemas, target]);

    useEffect(() => {
        if (!supportsSchemas || !selectedDatabase || !schemaOptions.length) return;
        if (target.schema && schemaOptions.some(option => option.value === target.schema)) return;

        const preferred = schemaOptions.find(option => option.value === 'public') ?? schemaOptions[0];
        if (!preferred) return;
        onTarget({ ...target, schema: preferred.value, table: target.mode === 'existing' ? '' : target.table });
    }, [onTarget, schemaOptions, selectedDatabase, supportsSchemas, target]);

    const metadataError = databasesQuery.error ?? (supportsSchemas ? schemasQuery.error : null) ?? (target.mode === 'existing' ? tablesQuery.error : null);
    const targetReady = Boolean(
        selectedDatabase &&
        (!supportsSchemas || target.schema) &&
        target.table.trim() &&
        !databasesQuery.isPending &&
        (!supportsSchemas || !schemasQuery.isPending) &&
        (target.mode !== 'existing' || !tablesQuery.isPending),
    );

    return (
        <>
            <StepHeader eyebrow={t('Step', { number: stepNumber })} title={t('Target.Title')} description={t('Target.Description')} />
            <div className="grid gap-4 sm:grid-cols-2">
                {(['create', 'existing'] as const).map(mode => (
                    <button
                        key={mode}
                        type="button"
                        onClick={() => {
                            if (mode !== target.mode) onTarget({ ...target, mode, table: '' });
                        }}
                        className={cn(
                            'flex min-h-28 items-start gap-3 border p-4 text-left transition-colors',
                            target.mode === mode ? 'border-primary bg-primary/5' : 'hover:bg-muted/30',
                        )}
                    >
                        <span
                            className={cn(
                                'mt-0.5 flex size-5 items-center justify-center rounded-full border',
                                target.mode === mode && 'border-primary bg-primary text-primary-foreground',
                            )}
                        >
                            {target.mode === mode ? <Check className="size-3" /> : null}
                        </span>
                        <span>
                            <span className="block font-medium">{t(`Target.${mode}.Title`)}</span>
                            <span className="mt-1 block text-sm leading-5 text-muted-foreground">{t(`Target.${mode}.Description`)}</span>
                        </span>
                    </button>
                ))}
            </div>
            <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="import-target-database">{t('Target.Database')}</Label>
                    <Select
                        value={selectedDatabase}
                        onValueChange={database =>
                            onTarget({
                                ...target,
                                database,
                                schema: supportsSchemas ? undefined : target.schema,
                                table: target.mode === 'existing' ? '' : target.table,
                            })
                        }
                        disabled={pending || databasesQuery.isPending || !databaseOptions.length}
                    >
                        <SelectTrigger id="import-target-database" className="w-full">
                            <SelectValue placeholder={databasesQuery.isPending ? t('Target.DatabaseLoading') : t('Target.DatabaseSelect')} />
                        </SelectTrigger>
                        <SelectContent>
                            {databaseOptions.length ? (
                                databaseOptions.map(option => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))
                            ) : (
                                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                    {databasesQuery.isPending ? t('Target.DatabaseLoading') : t('Target.DatabaseEmpty')}
                                </div>
                            )}
                        </SelectContent>
                    </Select>
                </div>
                {supportsSchemas ? (
                    <div className="space-y-2">
                        <Label htmlFor="import-target-schema">{t('Target.Schema')}</Label>
                        <Select
                            value={target.schema ?? ''}
                            onValueChange={schema => onTarget({ ...target, schema, table: target.mode === 'existing' ? '' : target.table })}
                            disabled={pending || !selectedDatabase || schemasQuery.isPending || !schemaOptions.length}
                        >
                            <SelectTrigger id="import-target-schema" className="w-full">
                                <SelectValue placeholder={schemasQuery.isPending ? t('Target.SchemaLoading') : t('Target.SchemaSelect')} />
                            </SelectTrigger>
                            <SelectContent>
                                {schemaOptions.length ? (
                                    schemaOptions.map(option => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))
                                ) : (
                                    <div className="px-2 py-1.5 text-sm text-muted-foreground">{schemasQuery.isPending ? t('Target.SchemaLoading') : t('Target.SchemaEmpty')}</div>
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                ) : null}
                <div className="space-y-2 sm:col-span-2">
                    {target.mode === 'existing' ? (
                        <>
                            <Label htmlFor="import-target-table">{t('Target.Table')}</Label>
                            <Select
                                value={selectedTableValue}
                                onValueChange={value => {
                                    const option = tableOptions.find(candidate => candidate.value === value);
                                    if (option) onTarget({ ...target, table: option.table, schema: option.schema ?? target.schema });
                                }}
                                disabled={pending || !selectedDatabase || (supportsSchemas && !target.schema) || tablesQuery.isPending || !tableOptions.length}
                            >
                                <SelectTrigger id="import-target-table" className="w-full">
                                    <SelectValue placeholder={tablesQuery.isPending ? t('Target.TableLoading') : t('Target.TableSelect')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {tableOptions.length ? (
                                        tableOptions.map(option => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))
                                    ) : (
                                        <div className="px-2 py-1.5 text-sm text-muted-foreground">{tablesQuery.isPending ? t('Target.TableLoading') : t('Target.TableEmpty')}</div>
                                    )}
                                </SelectContent>
                            </Select>
                        </>
                    ) : (
                        <>
                            <Label htmlFor="import-target-new-table">{t('Target.NewTableName')}</Label>
                            <Input
                                id="import-target-new-table"
                                value={target.table}
                                onChange={event => onTarget({ ...target, table: event.target.value })}
                                placeholder={t('Target.TablePlaceholder')}
                            />
                        </>
                    )}
                </div>
                {metadataError ? <p className="text-sm text-destructive sm:col-span-2">{t('Target.MetadataError')}</p> : null}
            </div>
            <StepActions back={onBack} backLabel={t('Common.Back')} next={onContinue} nextLabel={t('Target.Inspect')} disabled={!targetReady} pending={pending} />
        </>
    );
}

function MappingStep({
    t,
    stepNumber,
    mappings,
    onMappings,
    targetMode,
    targetSchema,
    onBack,
    onContinue,
}: {
    t: WizardTranslator;
    stepNumber: number;
    mappings: Mapping[];
    onMappings: (mappings: Mapping[]) => void;
    targetMode: Target['mode'];
    targetSchema: TargetSchema | null;
} & StepNavigation) {
    const update = (index: number, patch: Partial<Mapping>) => onMappings(mappings.map((mapping: Mapping, item: number) => (item === index ? { ...mapping, ...patch } : mapping)));
    const move = (index: number, direction: -1 | 1) => {
        const next = [...mappings];
        const destination = index + direction;
        if (destination < 0 || destination >= next.length) return;
        [next[index], next[destination]] = [next[destination], next[index]];
        onMappings(next.map((mapping, order) => ({ ...mapping, order })));
    };
    return (
        <>
            <StepHeader eyebrow={t('Step', { number: stepNumber })} title={t('Mapping.Title')} description={t('Mapping.Description')} />
            <div className={cn('border', WIZARD_TABLE_VIEWPORT_CLASS)}>
                <Table>
                    <TableHeader className={WIZARD_TABLE_HEADER_CLASS}>
                        <TableRow>
                            <TableHead className="w-20">{t('Mapping.Order')}</TableHead>
                            <TableHead>{t('Mapping.Source')}</TableHead>
                            <TableHead>{t('Mapping.Target')}</TableHead>
                            <TableHead>{t('Mapping.Type')}</TableHead>
                            <TableHead className="w-24">{t('Mapping.Ignore')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {mappings.map((mapping: Mapping, index: number) => (
                            <TableRow key={mapping.source} className={mapping.ignored ? 'opacity-50' : undefined}>
                                <TableCell>
                                    <div className="flex">
                                        <Button size="icon-xs" variant="ghost" onClick={() => move(index, -1)} disabled={index === 0}>
                                            <ChevronUp />
                                        </Button>
                                        <Button size="icon-xs" variant="ghost" onClick={() => move(index, 1)} disabled={index === mappings.length - 1}>
                                            <ChevronDown />
                                        </Button>
                                    </div>
                                </TableCell>
                                <TableCell className="font-mono text-xs">{mapping.source}</TableCell>
                                <TableCell>
                                    {targetMode === 'existing' ? (
                                        <Select
                                            value={mapping.target}
                                            onValueChange={value => {
                                                const column = targetSchema?.columns.find(item => item.name === value);
                                                update(index, { target: value, targetType: column?.importType ?? mapping.targetType, ignored: false });
                                            }}
                                        >
                                            <SelectTrigger className="min-w-44">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {targetSchema?.columns.map(column => (
                                                    <SelectItem key={column.name} value={column.name}>
                                                        {column.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Input value={mapping.target} onChange={event => update(index, { target: event.target.value })} />
                                    )}
                                </TableCell>
                                <TableCell>
                                    {targetMode === 'existing' ? (
                                        <span className="text-sm text-muted-foreground">
                                            {targetSchema?.columns.find(column => column.name === mapping.target)?.databaseType ?? '—'}
                                        </span>
                                    ) : (
                                        <Select value={mapping.targetType} onValueChange={(value: ImportColumnType) => update(index, { targetType: value })}>
                                            <SelectTrigger className="min-w-36">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {COLUMN_TYPES.map(type => (
                                                    <SelectItem key={type} value={type}>
                                                        {t(`Types.${type}`)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <Checkbox checked={mapping.ignored} onCheckedChange={value => update(index, { ignored: Boolean(value) })} aria-label={t('Mapping.Ignore')} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <StepActions
                back={onBack}
                backLabel={t('Common.Back')}
                next={onContinue}
                nextLabel={t('Common.Next')}
                disabled={mappings.every((mapping: Mapping) => mapping.ignored) || mappings.some((mapping: Mapping) => !mapping.ignored && !mapping.target.trim())}
            />
        </>
    );
}

function CleanDataStep({
    t,
    stepNumber,
    profile,
    mappings,
    targetSchema,
    operations,
    onOperations,
    preview,
    previewPending,
    previewError,
    pending,
    onBack,
    onContinue,
}: {
    t: WizardTranslator;
    stepNumber: number;
    profile: Profile;
    mappings: Mapping[];
    targetSchema: TargetSchema | null;
    operations: CleaningOperation[];
    onOperations: (operations: CleaningOperation[]) => void;
    preview?: TransformPreview;
    previewPending: boolean;
    previewError: string | null;
    pending: boolean;
} & StepNavigation) {
    const activeMappings = mappings.filter(mapping => !mapping.ignored).sort((left, right) => left.order - right.order);
    const [selectedSource, setSelectedSource] = useState(activeMappings[0]?.source ?? '');
    const selected = activeMappings.find(mapping => mapping.source === selectedSource) ?? activeMappings[0];
    const selectedOperations = operations.map((operation, index) => ({ operation, index })).filter(item => item.operation.column === selected?.source);
    const targetColumn = targetSchema?.columns.find(column => column.name === selected?.target);
    const previewRows = preview?.rows ?? [];

    const addSingleton = (operation: CleaningOperation) => {
        if (operations.some(item => item.kind === operation.kind && item.column === operation.column)) return;
        onOperations([...operations, operation]);
    };
    const update = (index: number, operation: CleaningOperation) => onOperations(operations.map((item, itemIndex) => (itemIndex === index ? operation : item)));
    const remove = (index: number) => onOperations(operations.filter((_, itemIndex) => itemIndex !== index));
    const move = (index: number, direction: -1 | 1) => {
        const next = [...operations];
        const columnIndexes = next.map((operation, itemIndex) => ({ operation, itemIndex })).filter(item => item.operation.column === selected?.source);
        const position = columnIndexes.findIndex(item => item.itemIndex === index);
        const destination = columnIndexes[position + direction]?.itemIndex;
        if (destination === undefined) return;
        [next[index], next[destination]] = [next[destination], next[index]];
        onOperations(next);
    };

    return (
        <div className="flex min-h-full flex-col xl:h-full xl:min-h-0">
            <StepHeader eyebrow={t('Step', { number: stepNumber })} title={t('Clean.Title')} description={t('Clean.Description')} />
            <div className="grid gap-6 xl:min-h-0 xl:flex-1 xl:grid-cols-[360px_minmax(0,1fr)]">
                <section className="flex min-h-0 flex-col border">
                    <div className="border-b p-4">
                        <Label>{t('Clean.Column')}</Label>
                        <Select value={selected?.source} onValueChange={setSelectedSource}>
                            <SelectTrigger className="mt-2 w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {activeMappings.map(mapping => (
                                    <SelectItem key={mapping.source} value={mapping.source}>
                                        {mapping.source} → {mapping.target}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {selected ? (
                            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline">{t(`Types.${selected.targetType}`)}</Badge>
                                <span>{t('Clean.SourceIssues', { count: profile.columns.find(column => column.name === selected.source)?.issues.length ?? 0 })}</span>
                            </div>
                        ) : null}
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                        {selectedOperations.map(({ operation, index }, position) => (
                            <div key={`${operation.kind}-${index}`} className="space-y-3 border p-3">
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary">{t(`Clean.Operations.${operation.kind}`)}</Badge>
                                    <div className="ml-auto flex">
                                        <Button size="icon-xs" variant="ghost" disabled={position === 0 || operation.kind === 'dropInvalid'} onClick={() => move(index, -1)}>
                                            <ChevronUp />
                                        </Button>
                                        <Button
                                            size="icon-xs"
                                            variant="ghost"
                                            disabled={position === selectedOperations.length - 1 || selectedOperations[position + 1]?.operation.kind === 'dropInvalid'}
                                            onClick={() => move(index, 1)}
                                        >
                                            <ChevronDown />
                                        </Button>
                                        <Button size="icon-xs" variant="ghost" onClick={() => remove(index)}>
                                            <Trash2 />
                                        </Button>
                                    </div>
                                </div>
                                {operation.kind === 'replace' ? (
                                    <div className="grid gap-2">
                                        <Input value={operation.find} placeholder={t('Clean.Find')} onChange={event => update(index, { ...operation, find: event.target.value })} />
                                        <Input
                                            value={operation.replacement}
                                            placeholder={t('Clean.Replacement')}
                                            onChange={event => update(index, { ...operation, replacement: event.target.value })}
                                        />
                                    </div>
                                ) : null}
                            </div>
                        ))}
                        {selectedOperations.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t('Clean.NoOperations')}</p> : null}
                    </div>
                    {selected ? (
                        <div className="flex flex-wrap gap-2 border-t p-4">
                            <Button size="sm" variant="outline" onClick={() => addSingleton({ kind: 'trim', column: selected.source })}>
                                <Plus /> {t('Clean.Operations.trim')}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => addSingleton({ kind: 'lowercase', column: selected.source })}>
                                <Plus /> {t('Clean.Operations.lowercase')}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onOperations([...operations, { kind: 'replace', column: selected.source, find: '', replacement: '' }])}
                            >
                                <Plus /> {t('Clean.Operations.replace')}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => addSingleton({ kind: 'emptyToNull', column: selected.source })}>
                                <Plus /> {t('Clean.Operations.emptyToNull')}
                            </Button>
                            {selected.targetType !== 'string' ? (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                        addSingleton({
                                            kind: 'dropInvalid',
                                            column: selected.source,
                                            targetType: selected.targetType as Exclude<ImportColumnType, 'string'>,
                                            dropNulls: targetColumn ? !targetColumn.nullable : false,
                                        })
                                    }
                                >
                                    <Plus /> {t('Clean.Operations.dropInvalid')}
                                </Button>
                            ) : null}
                        </div>
                    ) : null}
                </section>
                <section className="flex min-h-0 flex-col border">
                    <div className="flex items-center justify-between border-b px-4 py-3">
                        <div>
                            <p className="text-sm font-medium">{t('Clean.Preview')}</p>
                            <p className="text-xs text-muted-foreground">{t('Clean.SampleOnly')}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {previewPending ? <Loader2 className="size-4 animate-spin" /> : null}
                            <Badge variant={preview?.droppedRows ? 'destructive' : 'secondary'}>{t('Clean.Dropped', { count: preview?.droppedRows ?? 0 })}</Badge>
                        </div>
                    </div>
                    {previewError ? (
                        <Alert variant="destructive" className="m-4">
                            <XCircle />
                            <AlertTitle>{t('Clean.PreviewFailed')}</AlertTitle>
                            <AlertDescription>{previewError}</AlertDescription>
                        </Alert>
                    ) : null}
                    <div className={WIZARD_FILL_TABLE_VIEWPORT_CLASS}>
                        <Table>
                            <TableHeader className={WIZARD_TABLE_HEADER_CLASS}>
                                <TableRow>
                                    <TableHead>{t('Clean.Row')}</TableHead>
                                    <TableHead>{t('Clean.Before')}</TableHead>
                                    <TableHead>{t('Clean.After')}</TableHead>
                                    <TableHead>{t('Clean.Result')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {previewRows.map(row => (
                                    <TableRow key={row.sourceRow} className={row.outcome === 'dropped' ? 'bg-destructive/5' : undefined}>
                                        <TableCell className="font-mono text-xs">{row.sourceRow}</TableCell>
                                        <TableCell className="max-w-64 truncate font-mono text-xs">{selected ? (row.before[selected.source] ?? 'NULL') : '—'}</TableCell>
                                        <TableCell className="max-w-64 truncate font-mono text-xs">{selected ? (row.after[selected.target] ?? 'NULL') : '—'}</TableCell>
                                        <TableCell>
                                            <Badge variant={row.outcome === 'dropped' ? 'destructive' : 'outline'}>{t(`Clean.${row.outcome}`)}</Badge>
                                            {row.errors.length ? (
                                                <p
                                                    className="mt-1 max-w-48 truncate text-xs text-destructive"
                                                    title={row.errors.map(error => transformErrorLabel(t, error)).join('; ')}
                                                >
                                                    {row.errors.map(error => transformErrorLabel(t, error)).join('; ')}
                                                </p>
                                            ) : null}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </section>
            </div>
            <StepActions
                back={onBack}
                backLabel={t('Common.Back')}
                next={onContinue}
                nextLabel={t('Common.Next')}
                disabled={!cleaningOperationsValid(operations)}
                pending={pending}
            />
        </div>
    );
}

function OptionsStep({
    t,
    stepNumber,
    target,
    writeMode,
    onWriteMode,
    batchSize,
    onBatchSize,
    replaceConfirmed,
    onReplaceConfirmed,
    writeCapability,
    replaceCapability,
    pending,
    onBack,
    onContinue,
}: {
    t: WizardTranslator;
    stepNumber: number;
    target: Target;
    writeMode: 'append' | 'replace';
    onWriteMode: (mode: 'append' | 'replace') => void;
    batchSize: number;
    onBatchSize: (size: number) => void;
    replaceConfirmed: boolean;
    onReplaceConfirmed: (confirmed: boolean) => void;
    writeCapability: ImportWriteCapability | null;
    replaceCapability: ImportWriteCapability | null;
    pending: boolean;
} & StepNavigation) {
    return (
        <>
            <StepHeader
                eyebrow={t('Step', { number: stepNumber })}
                title={t('Options.Title')}
                description={
                    !writeCapability
                        ? t('Options.Description')
                        : writeCapability.supported && writeCapability.atomicity === 'best-effort'
                          ? t('Options.BestEffortDescription')
                          : t('Options.AtomicDescription')
                }
            />
            {target.mode === 'existing' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                    {(['append', 'replace'] as const).map(mode => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => onWriteMode(mode)}
                            disabled={mode === 'replace' && replaceCapability?.supported === false}
                            className={cn(
                                'border p-4 text-left disabled:cursor-not-allowed disabled:opacity-50',
                                writeMode === mode ? 'border-primary bg-primary/5' : 'hover:bg-muted/30',
                            )}
                        >
                            <span className="font-medium">{t(`Options.${mode}.Title`)}</span>
                            <span className="mt-1 block text-sm text-muted-foreground">{t(`Options.${mode}.Description`)}</span>
                        </button>
                    ))}
                </div>
            ) : (
                <Alert>
                    <Table2 />
                    <AlertTitle>{t('Options.CreateMode')}</AlertTitle>
                    <AlertDescription>{t('Options.CreateModeDescription')}</AlertDescription>
                </Alert>
            )}
            {replaceCapability?.supported === false ? (
                <Alert className="mt-5">
                    <XCircle />
                    <AlertTitle>{t('Options.ReplaceUnavailable')}</AlertTitle>
                    <AlertDescription>{t(`Options.CapabilityReasons.${replaceCapability.reason}`)}</AlertDescription>
                </Alert>
            ) : null}
            {writeCapability?.supported && writeCapability.atomicity === 'best-effort' ? (
                <Alert className="mt-5">
                    <Circle />
                    <AlertTitle>{t('Options.BestEffortTitle')}</AlertTitle>
                    <AlertDescription>{t(`Options.CapabilityReasons.${writeCapability.reason ?? 'batch_commits'}`)}</AlertDescription>
                </Alert>
            ) : null}
            <div className="mt-7 max-w-sm space-y-2">
                <Label>{t('Options.Batch')}</Label>
                <Input type="number" min={1} max={100000} value={batchSize} onChange={event => onBatchSize(Math.max(1, Math.min(100000, Number(event.target.value) || 1)))} />
                <p className="text-xs text-muted-foreground">{t('Options.BatchDescription')}</p>
            </div>
            {target.mode === 'existing' && writeMode === 'replace' ? (
                <Alert variant="destructive" className="mt-7">
                    <XCircle />
                    <AlertTitle>{t('Options.ReplaceWarning', { table: target.table })}</AlertTitle>
                    <AlertDescription>
                        <label className="mt-3 flex items-center gap-2 text-foreground">
                            <Checkbox checked={replaceConfirmed} onCheckedChange={value => onReplaceConfirmed(Boolean(value))} />
                            {t('Options.ReplaceConfirm', { table: target.table })}
                        </label>
                    </AlertDescription>
                </Alert>
            ) : null}
            <StepActions
                back={onBack}
                backLabel={t('Common.Back')}
                next={onContinue}
                nextLabel={t('Options.Review')}
                disabled={writeCapability?.supported === false || (target.mode === 'existing' && writeMode === 'replace' && !replaceConfirmed)}
                pending={pending}
            />
        </>
    );
}

function ExecuteStep({
    t,
    stepNumber,
    run,
    writeCapability,
    totalRows,
    writtenRows,
    progressPercent,
    executePending,
    cancelPending,
    onExecute,
    onCancel,
    onBack,
    onFinish,
    allowTerminalDismiss,
}: {
    t: WizardTranslator;
    stepNumber: number;
    run: ImportRun;
    writeCapability: ImportWriteCapability | null;
    totalRows: number;
    writtenRows: number;
    progressPercent: number;
    executePending: boolean;
    cancelPending: boolean;
    onExecute: () => void;
    onCancel: () => void;
    onBack: () => void;
    onFinish: () => void;
    allowTerminalDismiss: boolean;
}) {
    const active = ACTIVE_IMPORT_RUN_STATUSES.includes(run.status);
    const terminal = TERMINAL_IMPORT_RUN_STATUSES.includes(run.status);
    const completed = run.status === 'completed';
    return (
        <>
            <StepHeader eyebrow={t('Step', { number: stepNumber })} title={t('Execute.Title')} description={t('Execute.Description')} />
            <div className="border">
                <div className="flex items-center gap-3 border-b px-5 py-4">
                    {completed ? (
                        <CheckCircle2 className="size-5 text-emerald-600" />
                    ) : active ? (
                        <Loader2 className="size-5 animate-spin text-primary" />
                    ) : run.status === 'failed' || run.status === 'commit_unknown' ? (
                        <XCircle className="size-5 text-destructive" />
                    ) : (
                        <Circle className="size-5 text-muted-foreground" />
                    )}
                    <div>
                        <p className="font-medium">{t(`Status.${run.status}`)}</p>
                        <p className="text-xs text-muted-foreground">{t('Execute.Phase', { phase: run.phase })}</p>
                    </div>
                    <Badge className="ml-auto" variant={completed ? 'default' : 'secondary'}>
                        {run.batchCount} {t('Execute.Batches')}
                    </Badge>
                </div>
                <div className="space-y-5 p-5">
                    {writeCapability?.supported ? (
                        <Alert>
                            <Circle />
                            <AlertTitle>{writeCapability.atomicity === 'atomic' ? t('Options.AtomicTitle') : t('Options.BestEffortTitle')}</AlertTitle>
                            <AlertDescription>
                                {writeCapability.atomicity === 'atomic'
                                    ? t('Options.AtomicDescription')
                                    : t(`Options.CapabilityReasons.${writeCapability.reason ?? 'batch_commits'}`)}
                            </AlertDescription>
                        </Alert>
                    ) : null}
                    <Progress value={completed ? 100 : progressPercent} />
                    <div className="grid gap-4 sm:grid-cols-4">
                        <Metric label={t('Execute.Processed')} value={formatNumber(writtenRows)} />
                        <Metric
                            label={run.pendingRows > 0 ? t('Execute.Pending') : t('Execute.Inserted')}
                            value={formatNumber(run.pendingRows > 0 ? run.pendingRows : run.insertedRows)}
                        />
                        <Metric label={t('Execute.Filtered')} value={formatNumber(run.filteredRows)} />
                        <Metric label={t('Execute.Total')} value={formatNumber(totalRows)} />
                    </div>
                    {run.pendingRows > 0 ? <p className="text-xs text-amber-700 dark:text-amber-400">{t('Execute.PendingCommit')}</p> : null}
                    {run.errorMessage ? (
                        <Alert variant="destructive">
                            <XCircle />
                            <AlertTitle>{run.errorCode ?? t('Errors.Unknown')}</AlertTitle>
                            <AlertDescription>{run.errorMessage}</AlertDescription>
                        </Alert>
                    ) : null}
                    {run.errorCode === 'IMPORT_PARTIAL_WRITE' || run.errorCode === 'IMPORT_CANCELED_PARTIAL' ? (
                        <Alert>
                            <Circle />
                            <AlertTitle>{t('Execute.PartialWriteTitle')}</AlertTitle>
                            <AlertDescription>{t('Execute.PartialWriteDescription', { rows: formatNumber(run.insertedRows) })}</AlertDescription>
                        </Alert>
                    ) : null}
                </div>
            </div>
            <div className="mt-8 flex items-center justify-between border-t pt-5">
                {!completed ? (
                    <Button variant="ghost" onClick={onBack} disabled={active}>
                        <ArrowLeft />
                        {t('Common.Back')}
                    </Button>
                ) : null}
                <div className="ml-auto flex gap-2">
                    {completed ? (
                        <Button onClick={onFinish}>
                            {t('Execute.Finish')}
                            <ArrowRight />
                        </Button>
                    ) : null}
                    {!completed && terminal && allowTerminalDismiss ? (
                        <Button variant="outline" onClick={onFinish}>
                            {t('Modal.Dismiss')}
                        </Button>
                    ) : null}
                    {active ? (
                        <Button variant="outline" onClick={onCancel} disabled={cancelPending}>
                            {cancelPending ? <Loader2 className="animate-spin" /> : null}
                            {t('Execute.Cancel')}
                        </Button>
                    ) : null}
                    {!active && !terminal ? (
                        <Button onClick={onExecute} disabled={executePending}>
                            {executePending ? <Loader2 className="animate-spin" /> : <ArrowDownToLine />}
                            {t('Execute.Start')}
                        </Button>
                    ) : null}
                </div>
            </div>
        </>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
        </div>
    );
}

function normalizeSelectOptions(options?: MetadataOption[]): SelectOption[] {
    const normalized = new Map<string, SelectOption>();
    for (const option of options ?? []) {
        const value = String(option.value ?? option.name ?? option.label ?? '').trim();
        if (!value || normalized.has(value)) continue;
        normalized.set(value, { value, label: String(option.label ?? option.name ?? option.value ?? value) });
    }
    return [...normalized.values()];
}

function normalizeTableOptions(options: MetadataOption[] | undefined, supportsSchemas: boolean): TableSelectOption[] {
    const normalized = new Map<string, TableSelectOption>();
    for (const option of options ?? []) {
        const rawValue = String(option.value ?? option.name ?? option.label ?? '').trim();
        if (!rawValue) continue;

        let schema = option.schema?.trim() || undefined;
        let table = rawValue;
        if (supportsSchemas) {
            const separator = rawValue.lastIndexOf('.');
            if (separator > 0) {
                schema ??= rawValue.slice(0, separator);
                table = rawValue.slice(separator + 1);
            } else {
                schema ??= 'public';
            }
        }

        const value = supportsSchemas ? `${schema}.${table}` : table;
        if (!table || normalized.has(value)) continue;
        normalized.set(value, { value, table, schema, label: String(option.label ?? table) });
    }
    return [...normalized.values()];
}

function normalizedTarget(target: Target): Target {
    return {
        mode: target.mode,
        table: target.table.trim(),
        ...(target.database?.trim() ? { database: target.database.trim() } : {}),
        ...(target.schema?.trim() ? { schema: target.schema.trim() } : {}),
    };
}

function defaultMappings(profile: Profile, target: TargetSchema | null): Mapping[] {
    const exact = new Map(target?.columns.map(column => [column.name, column]) ?? []);
    const insensitive = new Map<string, TargetSchema['columns']>();
    for (const column of target?.columns ?? []) {
        const key = column.name.toLocaleLowerCase();
        insensitive.set(key, [...(insensitive.get(key) ?? []), column]);
    }
    return profile.columns.map((column, order) => {
        const exactMatch = exact.get(column.name);
        const candidates = insensitive.get(column.name.toLocaleLowerCase()) ?? [];
        const match = exactMatch ?? (candidates.length === 1 ? candidates[0] : undefined);
        return { source: column.name, target: match?.name ?? column.name, targetType: match?.importType ?? column.detectedType, ignored: Boolean(target && !match), order };
    });
}

function readWriteCapability(value: unknown): ImportWriteCapability | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const capability = value as Record<string, unknown>;
    if (capability.supported === false && typeof capability.reason === 'string') return capability as ImportWriteCapability;
    if (capability.supported === true && (capability.atomicity === 'atomic' || capability.atomicity === 'best-effort')) return capability as ImportWriteCapability;
    return null;
}

function connectionHeaders(connectionId: string) {
    return { 'Content-Type': 'application/json', [X_CONNECTION_ID_KEY]: connectionId };
}

function sourceOptionsEqual(left: SourceOptions | null | undefined, right: SourceOptions | null | undefined) {
    if (!left || !right || left.format !== right.format) return false;
    if (left.format !== 'csv' || right.format !== 'csv') return true;
    return left.delimiter === right.delimiter && left.hasHeader === right.hasHeader && left.encoding === right.encoding && left.quoteChar === right.quoteChar;
}

function sourceFormatForFileName(fileName: string, extension?: string | null): SourceFormat | null {
    const normalized = (extension || fileName.split('.').pop() || '').toLowerCase();
    if (normalized === 'csv' || normalized === 'tsv') return 'csv';
    if (normalized === 'parquet') return 'parquet';
    if (normalized === 'ndjson' || normalized === 'jsonl') return 'ndjson';
    if (normalized === 'arrow' || normalized === 'ipc' || normalized === 'feather') return 'arrow';
    return null;
}

function readSourceWarnings(value: unknown): Array<{ code: 'DECIMAL_STRINGIFIED'; column: string; sourceType: string }> {
    if (!Array.isArray(value)) return [];
    return value.filter((warning): warning is { code: 'DECIMAL_STRINGIFIED'; column: string; sourceType: string } =>
        Boolean(
            warning &&
            typeof warning === 'object' &&
            (warning as { code?: unknown }).code === 'DECIMAL_STRINGIFIED' &&
            typeof (warning as { column?: unknown }).column === 'string' &&
            typeof (warning as { sourceType?: unknown }).sourceType === 'string',
        ),
    );
}

function readSourceSchema(value: unknown): Array<{ name: string; sourceType: string; importType: ImportColumnType }> {
    if (!Array.isArray(value)) return [];
    return value.filter((column): column is { name: string; sourceType: string; importType: ImportColumnType } =>
        Boolean(
            column &&
            typeof column === 'object' &&
            typeof (column as { name?: unknown }).name === 'string' &&
            typeof (column as { sourceType?: unknown }).sourceType === 'string' &&
            COLUMN_TYPES.includes((column as { importType?: ImportColumnType }).importType as ImportColumnType),
        ),
    );
}

function importPath(organization: string, connectionId: string) {
    return `/${encodeURIComponent(organization)}/${encodeURIComponent(connectionId)}/import`;
}

function importRunPath(organization: string, connectionId: string, runId: string) {
    return `${importPath(organization, connectionId)}/${encodeURIComponent(runId)}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
    const payload = (await response.json().catch(() => null)) as { data?: T; message?: string; importCode?: string; details?: unknown } | null;
    if (!response.ok || !payload?.data) {
        throw new ImportApiError(payload?.message ?? `Request failed (${response.status})`, response.status, payload?.importCode, payload?.details);
    }
    return payload.data;
}

class ImportApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly importCode?: string,
        readonly details?: unknown,
    ) {
        super(message);
        this.name = 'ImportApiError';
    }
}

function uploadFile(runId: string, file: File, onProgress: (percent: number) => void) {
    return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', `/api/import-runs/${encodeURIComponent(runId)}/source`);
        xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
        xhr.upload.onprogress = event => {
            if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                onProgress(100);
                resolve();
                return;
            }
            try {
                reject(new Error((JSON.parse(xhr.responseText) as { message?: string }).message ?? 'Upload failed'));
            } catch {
                reject(new Error('Upload failed'));
            }
        };
        xhr.send(file);
    });
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
function formatNumber(value: number) {
    return new Intl.NumberFormat().format(value);
}

function getWrittenRows(run?: ImportRun) {
    const rowsWritten = run?.progress?.rowsWritten;
    if (typeof rowsWritten === 'number' && Number.isFinite(rowsWritten)) return Math.max(0, rowsWritten);
    return run?.status === 'completed' ? Math.max(0, run.insertedRows) : 0;
}

function isCleaningOperation(operation: TransformOperation): operation is CleaningOperation {
    return operation.kind === 'trim' || operation.kind === 'lowercase' || operation.kind === 'replace' || operation.kind === 'emptyToNull' || operation.kind === 'dropInvalid';
}

function cleaningOperationsValid(operations: CleaningOperation[]) {
    return operations.every(operation => operation.kind !== 'replace' || operation.find.length > 0);
}

function transformErrorLabel(t: WizardTranslator, error: TransformPreview['rows'][number]['errors'][number]) {
    return error.code === 'required_null' ? t('Clean.RequiredNull', { column: error.column }) : t('Clean.InvalidType', { column: error.column, type: error.targetType });
}
