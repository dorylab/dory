'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Database, Layers3, Loader2, Table2, X } from 'lucide-react';

import { executeActionClient } from '@/lib/actions/client';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/registry/new-york-v4/ui/command';
import { Label } from '@/registry/new-york-v4/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import { cn } from '@dory/web-utils';
import { optionName, type DatabaseOption, type TableOption } from './work-form';

type WorkSchemaSelectorProps = {
    connectionId: string;
    connectionType?: string | null;
    selectedTables: string[];
    onSelectedTablesChange: (tables: string[]) => void;
    disabled?: boolean;
};

type SchemaOption = {
    label?: string;
    value?: string;
    name?: string;
};

function supportsSchemaPicker(connectionType?: string | null) {
    return connectionType === 'postgres' || connectionType === 'neon' || connectionType === 'sqlserver' || connectionType === 'oracle' || connectionType === 'duckdb';
}

function namespaceLabel(connectionType?: string | null) {
    return connectionType === 'duckdb' ? 'Catalog' : 'Database';
}

function normalizeSchema(item: unknown) {
    if (!item || typeof item !== 'object') return '';
    const schema = (item as Record<string, unknown>).schema;
    return typeof schema === 'string' ? schema : '';
}

function qualifiedTableName(input: { database: string; schema: string; table: TableOption }) {
    const tableName = optionName(input.table);
    if (tableName.includes('.') && !normalizeSchema(input.table)) return [input.database, tableName].filter(Boolean).join('.');
    const schema = normalizeSchema(input.table) || input.schema;
    return [input.database, schema, tableName].filter(Boolean).join('.');
}

function tableBelongsToSchema(table: TableOption, schema: string) {
    const tableSchema = normalizeSchema(table);
    if (tableSchema) return tableSchema === schema;

    const tableName = optionName(table);
    if (tableName.includes('.')) return tableName.split('.')[0] === schema;

    return schema === 'public';
}

function filterOptions<T extends DatabaseOption | SchemaOption | TableOption>(options: T[], query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter(option => optionName(option).toLowerCase().includes(normalized));
}

export function WorkSchemaSelector({ connectionId, connectionType, disabled = false, onSelectedTablesChange, selectedTables }: WorkSchemaSelectorProps) {
    const [database, setDatabase] = useState('');
    const [schema, setSchema] = useState('');
    const [databaseOpen, setDatabaseOpen] = useState(false);
    const [schemaOpen, setSchemaOpen] = useState(false);
    const [tablesOpen, setTablesOpen] = useState(false);
    const [databaseQuery, setDatabaseQuery] = useState('');
    const [schemaQuery, setSchemaQuery] = useState('');
    const [tableQuery, setTableQuery] = useState('');
    const showSchema = supportsSchemaPicker(connectionType);
    const firstLabel = namespaceLabel(connectionType);

    const databasesQuery = useQuery({
        queryKey: ['work-schema-selector', 'databases', connectionId],
        queryFn: async () => {
            const result = await executeActionClient<{ databases?: DatabaseOption[] }>('schema.listDatabases', { connectionId }, { currentConnectionId: connectionId });
            return result.databases ?? [];
        },
        enabled: Boolean(connectionId),
        staleTime: 5 * 60_000,
    });

    const databaseOptions = useMemo(() => databasesQuery.data ?? [], [databasesQuery.data]);
    const selectedDatabase = database || optionName(databaseOptions[0] ?? {});

    const schemasQuery = useQuery({
        queryKey: ['work-schema-selector', 'schemas', connectionId, selectedDatabase],
        queryFn: () => executeActionClient<SchemaOption[]>('schema.listSchemas', { connectionId, database: selectedDatabase }, { currentConnectionId: connectionId }),
        enabled: Boolean(connectionId && selectedDatabase && showSchema),
        staleTime: 5 * 60_000,
    });

    const schemaOptions = useMemo(() => schemasQuery.data ?? [], [schemasQuery.data]);
    const selectedSchema = schema || optionName(schemaOptions[0] ?? {});

    const tablesQuery = useQuery({
        queryKey: ['work-schema-selector', 'tables', connectionId, selectedDatabase],
        queryFn: async () => {
            const result = await executeActionClient<{ tables?: TableOption[] }>('schema.listTables', { connectionId, database: selectedDatabase }, { currentConnectionId: connectionId });
            return result.tables ?? [];
        },
        enabled: Boolean(connectionId && selectedDatabase),
        staleTime: 5 * 60_000,
    });

    const tableOptions = useMemo(() => {
        const options = tablesQuery.data ?? [];
        if (!showSchema || !selectedSchema) return options;
        return options.filter(table => tableBelongsToSchema(table, selectedSchema));
    }, [selectedSchema, showSchema, tablesQuery.data]);

    const filteredDatabases = useMemo(() => filterOptions(databaseOptions, databaseQuery), [databaseOptions, databaseQuery]);
    const filteredSchemas = useMemo(() => filterOptions(schemaOptions, schemaQuery), [schemaOptions, schemaQuery]);
    const filteredTables = useMemo(() => filterOptions(tableOptions, tableQuery), [tableOptions, tableQuery]);

    const selectedSet = useMemo(() => new Set(selectedTables), [selectedTables]);
    const tableButtonLabel = selectedTables.length ? `${selectedTables.length} selected` : tablesQuery.isLoading ? 'Loading tables...' : 'Choose tables';

    const handleDatabaseChange = (nextDatabase: string) => {
        setDatabase(nextDatabase);
        setSchema('');
        setDatabaseOpen(false);
    };

    const handleSchemaChange = (nextSchema: string) => {
        setSchema(nextSchema);
        setSchemaOpen(false);
    };

    const toggleTable = (table: TableOption) => {
        const value = qualifiedTableName({ database: selectedDatabase, schema: selectedSchema, table });
        if (!value) return;
        if (selectedSet.has(value)) {
            onSelectedTablesChange(selectedTables.filter(item => item !== value));
            return;
        }
        onSelectedTablesChange([...selectedTables, value]);
    };

    const removeTable = (table: string) => {
        onSelectedTablesChange(selectedTables.filter(item => item !== table));
    };

    return (
        <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                    <Label>{firstLabel}</Label>
                    <OptionCombobox
                        ariaLabel={`Select ${firstLabel.toLowerCase()}`}
                        disabled={disabled || databasesQuery.isLoading}
                        emptyLabel={databasesQuery.isLoading ? `Loading ${firstLabel.toLowerCase()}s...` : `No ${firstLabel.toLowerCase()}s found`}
                        icon="database"
                        onOpenChange={setDatabaseOpen}
                        onQueryChange={setDatabaseQuery}
                        onSelect={handleDatabaseChange}
                        open={databaseOpen}
                        options={filteredDatabases}
                        placeholder={`Select ${firstLabel.toLowerCase()}`}
                        query={databaseQuery}
                        searchPlaceholder={`Search ${firstLabel.toLowerCase()}s...`}
                        value={selectedDatabase}
                    />
                </div>

                {showSchema ? (
                    <div className="space-y-2">
                        <Label>Schema</Label>
                        <OptionCombobox
                            ariaLabel="Select schema"
                            disabled={disabled || !selectedDatabase || schemasQuery.isLoading}
                            emptyLabel={schemasQuery.isLoading ? 'Loading schemas...' : 'No schemas found'}
                            icon="schema"
                            onOpenChange={setSchemaOpen}
                            onQueryChange={setSchemaQuery}
                            onSelect={handleSchemaChange}
                            open={schemaOpen}
                            options={filteredSchemas}
                            placeholder="Select schema"
                            query={schemaQuery}
                            searchPlaceholder="Search schemas..."
                            value={selectedSchema}
                        />
                    </div>
                ) : null}

                <div className={showSchema ? 'space-y-2' : 'space-y-2 sm:col-span-2'}>
                    <Label>Selected tables</Label>
                    <Popover open={tablesOpen} onOpenChange={next => !disabled && setTablesOpen(next)}>
                        <PopoverTrigger asChild>
                            <Button type="button" variant="outline" role="combobox" aria-expanded={tablesOpen} disabled={disabled || !selectedDatabase} className="w-full justify-between">
                                <span className="flex min-w-0 items-center gap-2">
                                    {tablesQuery.isLoading ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Table2 className="size-4 shrink-0" />}
                                    <span className="truncate text-sm">{tableButtonLabel}</span>
                                </span>
                                <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
                            <Command shouldFilter={false}>
                                <CommandInput placeholder="Search tables..." value={tableQuery} onValueChange={setTableQuery} className="h-9" />
                                <CommandList className="max-h-64">
                                    <CommandEmpty>{tablesQuery.isLoading ? 'Loading tables...' : 'No tables found'}</CommandEmpty>
                                    <CommandGroup heading="Tables">
                                        {filteredTables.map(table => {
                                            const value = qualifiedTableName({ database: selectedDatabase, schema: selectedSchema, table });
                                            const selected = selectedSet.has(value);
                                            return (
                                                <CommandItem key={value} value={value} onSelect={() => toggleTable(table)} className="flex items-center gap-2">
                                                    <span
                                                        className={cn(
                                                            'border-input pointer-events-none flex size-4 shrink-0 items-center justify-center rounded border transition data-[selected=true]:border-primary data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground',
                                                        )}
                                                        data-selected={selected}
                                                    >
                                                        <Check className={cn('size-3', selected ? 'opacity-100' : 'opacity-0')} />
                                                    </span>
                                                    <span className="min-w-0 flex-1 truncate text-sm">{optionName(table)}</span>
                                                    {normalizeSchema(table) ? <span className="shrink-0 text-xs text-muted-foreground">{normalizeSchema(table)}</span> : null}
                                                </CommandItem>
                                            );
                                        })}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            {selectedTables.length ? (
                <div className="flex flex-wrap gap-2">
                    {selectedTables.map(table => (
                        <Badge key={table} variant="secondary" className="max-w-full gap-1.5">
                            <span className="truncate">{table}</span>
                            <button
                                type="button"
                                className="rounded-sm text-muted-foreground hover:text-foreground"
                                onClick={() => removeTable(table)}
                                disabled={disabled}
                                aria-label={`Remove ${table}`}
                            >
                                <X className="size-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            ) : (
                <p className="text-xs text-muted-foreground">Choose the tables the Agent should focus on.</p>
            )}
        </div>
    );
}

function OptionCombobox({
    ariaLabel,
    disabled,
    emptyLabel,
    icon,
    onOpenChange,
    onQueryChange,
    onSelect,
    open,
    options,
    placeholder,
    query,
    searchPlaceholder,
    value,
}: {
    ariaLabel: string;
    disabled?: boolean;
    emptyLabel: string;
    icon: 'database' | 'schema';
    onOpenChange: (open: boolean) => void;
    onQueryChange: (query: string) => void;
    onSelect: (value: string) => void;
    open: boolean;
    options: Array<DatabaseOption | SchemaOption>;
    placeholder: string;
    query: string;
    searchPlaceholder: string;
    value: string;
}) {
    const selected = options.find(option => optionName(option) === value);
    const Icon = icon === 'schema' ? Layers3 : Database;

    return (
        <Popover open={open} onOpenChange={next => !disabled && onOpenChange(next)}>
            <PopoverTrigger asChild>
                <Button type="button" variant="outline" role="combobox" aria-label={ariaLabel} aria-expanded={open} disabled={disabled} className="w-full justify-between">
                    <span className="flex min-w-0 items-center gap-2">
                        <Icon className="size-4 shrink-0" />
                        <span className="truncate text-sm">{selected ? optionName(selected) : value || placeholder}</span>
                    </span>
                    <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
                <Command shouldFilter={false}>
                    <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={onQueryChange} className="h-9" />
                    <CommandList className="max-h-64">
                        <CommandEmpty>{emptyLabel}</CommandEmpty>
                        <CommandGroup>
                            {options.map(option => {
                                const name = optionName(option);
                                return (
                                    <CommandItem key={name} value={name} onSelect={() => onSelect(name)} className="flex items-center gap-2">
                                        <Icon className="size-4 shrink-0" />
                                        <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                                        <Check className={cn('size-4', value === name ? 'opacity-100' : 'opacity-0')} />
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
