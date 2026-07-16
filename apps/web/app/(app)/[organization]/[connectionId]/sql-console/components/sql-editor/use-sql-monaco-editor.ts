'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type * as Monaco from 'monaco-editor';

import { vsPlusTheme } from '@/components/@dory/ui/monaco-editor/theme';
import { useColumns } from '@/hooks/use-columns';
import { useDatabases } from '@/hooks/use-databases';
import { useSchemas } from '@/hooks/use-schemas';
import { useTables } from '@/hooks/use-tables';
import { activeDatabaseAtom } from '@/shared/stores/app.store';
import { buildSqlEditorOptions, SqlEditorSettings } from '@/shared/stores/sql-editor-settings.store';
import { useAtomValue, useSetAtom } from 'jotai';
import type { UITabPayload } from '@dory/shared/types/tabs';
import { buildColumnPrefix, normalizeTableName, resolveTableFromAliasInSql } from './utils';
import { editorSelectionByTabAtom } from '../../sql-console.store';
import { useTranslations } from 'next-intl';
import type { ConnectionType } from '@dory/shared/types/connections';
import { getSqlDialectConfigForConnectionType, getSqlDialectParser, type SqlDialectParser } from '@/lib/sql/sql-dialect';
import { isPostgresFamilyConnectionType } from '@dory/drivers/types';

const MAX_SQL_LEN_FOR_PARSE = 20000;

type MonacoEnvironmentConfig = {
    getWorker?: (moduleId: string, label: string) => Worker;
};

type ContentChangeHandler = (tabId: string, content: string) => void;

type SqlModelEntry = {
    model: Monaco.editor.ITextModel;
    changeDisposable: Monaco.IDisposable;
    viewState: Monaco.editor.ICodeEditorViewState | null;
    lastExternalContent: string;
    suppressChange: boolean;
};

interface UseSqlMonacoEditorProps {
    tabs: UITabPayload[];
    activeTab: UITabPayload | undefined;
    workspaceActive: boolean;
    editorTheme: string;
    editorSettings: SqlEditorSettings;
    currentConnectionId?: string;
    currentConnectionType?: ConnectionType;
    containerRef: RefObject<HTMLDivElement | null>;
    onContentChange: ContentChangeHandler;
    onRunQuery?: () => void;
    onNewTab?: () => void;
    onInlineAskOpen?: () => void;
    onFormat?: () => void;
}

const resolveTableName = (table: any) => {
    return (table?.value ?? table?.label ?? table?.name ?? table?.tableName ?? table?.table ?? '').toString();
};

const resolveTableDisplayName = (table: any) => {
    return (table?.label ?? table?.value ?? table?.name ?? table?.tableName ?? table?.table ?? '').toString();
};

const resolveDatabaseName = (database: any) => {
    return (database?.value ?? database?.label ?? database?.name ?? database?.databaseName ?? '').toString();
};

const resolveSchemaName = (schema: any) => {
    return (schema?.value ?? schema?.label ?? schema?.name ?? '').toString();
};

const resolveSchemaQualifiedTable = (tableName: string, defaultSchemaName = 'public') => {
    const trimmed = tableName.trim();
    if (!trimmed) {
        return { schemaName: defaultSchemaName, tableName: '' };
    }

    const parts = trimmed.split('.');
    if (parts.length === 1) {
        return { schemaName: defaultSchemaName, tableName: parts[0] ?? '' };
    }

    return {
        schemaName: parts[0] || defaultSchemaName,
        tableName: parts.slice(1).join('.'),
    };
};

const dedupeCompletionItems = (items: Monaco.languages.CompletionItem[]) => {
    const seen = new Set<string>();

    return items.filter(item => {
        const label = typeof item.label === 'string' ? item.label : item.label.label;
        const insertText = typeof item.insertText === 'string' ? item.insertText : String(item.insertText ?? '');
        const detail = typeof item.detail === 'string' ? item.detail : String(item.detail ?? '');
        const key = [label, item.kind ?? '', insertText, detail].join('::');

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
};

type CompletionSyntaxContext = {
    syntaxContextType: string;
    wordRanges: Array<{ text?: string }>;
};

const normalizeCompletionSyntax = (syntax: unknown): CompletionSyntaxContext[] => {
    if (!Array.isArray(syntax)) return [];

    const out: CompletionSyntaxContext[] = [];
    for (const item of syntax) {
        if (!item || typeof item !== 'object') continue;
        const value = item as Record<string, unknown>;
        if (typeof value.syntaxContextType !== 'string') continue;
        const wordRanges = Array.isArray(value.wordRanges)
            ? value.wordRanges
                  .filter(word => word && typeof word === 'object')
                  .map(word => ({
                      text: typeof (word as Record<string, unknown>).text === 'string' ? ((word as Record<string, unknown>).text as string) : undefined,
                  }))
            : [];
        out.push({
            syntaxContextType: value.syntaxContextType,
            wordRanges,
        });
    }
    return out;
};

const completionTextFromWordRanges = (wordRanges: Array<{ text?: string }> | undefined, fallback: string) => {
    const text = (Array.isArray(wordRanges) ? wordRanges : [])
        .map(word => (typeof word?.text === 'string' ? word.text : ''))
        .join('')
        .trim();
    return text || fallback;
};

const resolveTablesForColumnContext = (
    parser: { getAllEntities?: (sql: string, caretPos: { lineNumber: number; column: number }) => any[] | null },
    sql: string,
    caretPos: { lineNumber: number; column: number },
    tables: any[],
    caretOffset: number,
) => {
    let entities: any[] | null = null;

    try {
        entities = parser.getAllEntities?.(sql, caretPos) ?? null;
    } catch (err) {
        console.warn('dt-sql-parser getAllEntities error:', err);
        return [];
    }

    if (!Array.isArray(entities)) return [];

    const candidates = entities
        .filter(entity => {
            const type = String(entity?.entityContextType ?? '').toLowerCase();
            return type === 'table' || type === 'table_create' || type === 'view';
        })
        .map(entity => {
            const text = normalizeTableName(String(entity?.text ?? ''));
            const pos = entity?.position;
            const start = pos?.startIndex ?? pos?.start ?? 0;
            const end = pos?.endIndex ?? pos?.end ?? start;
            const dist = caretOffset >= end ? caretOffset - end : start - caretOffset;
            return { text, dist: Math.max(dist, 0) };
        })
        .filter(e => e.text)
        .sort((a, b) => a.dist - b.dist)
        .map(e => e.text);

    if (candidates.length) return candidates;
    return tables.map(t => normalizeTableName(resolveTableName(t))).filter(Boolean);
};

const registerDtSqlCompletion = (
    monaco: typeof import('monaco-editor'),
    languageId: string,
    parser: SqlDialectParser,
    currentConnectionType: ConnectionType | undefined,
    t: ReturnType<typeof useTranslations>,
    getTables: () => any[],
    getColumns: (tableName: string) => Promise<any[] | undefined>,
    getDatabases: () => any[],
    getSchemas: () => any[],
    getActiveDatabase: () => string,
) => {
    const isPostgres = isPostgresFamilyConnectionType(currentConnectionType);

    return monaco.languages.registerCompletionItemProvider(languageId, {
        triggerCharacters: [' ', '.', ',', '(', '=', '\n'],
        async provideCompletionItems(model, position) {
            const sql = model.getValue();
            if (sql.length > MAX_SQL_LEN_FOR_PARSE) {
                return { suggestions: [] };
            }

            const caretPos = {
                lineNumber: position.lineNumber,
                column: position.column,
            };

            const wordInfo = model.getWordUntilPosition(position);
            const range = new monaco.Range(position.lineNumber, wordInfo.startColumn, position.lineNumber, wordInfo.endColumn);
            const currentWord = wordInfo.word ?? '';
            const tables = getTables() || [];
            const databases = getDatabases() || [];
            const schemas = getSchemas() || [];
            const activeDb = getActiveDatabase() ?? '';

            let suggestion: any = {};
            try {
                suggestion = parser.getSuggestionAtCaretPosition?.(sql, caretPos) || {};
            } catch (err) {
                console.warn('dt-sql-parser getSuggestionAtCaretPosition error:', err);
                suggestion = {};
            }

            try {
                const { keywords, syntax } = suggestion as {
                    keywords?: string[];
                    syntax?: unknown;
                };

                const items: Monaco.languages.CompletionItem[] = [];
                const syntaxList = normalizeCompletionSyntax(syntax);
                const columnPrefix = buildColumnPrefix(syntaxList, currentWord);

                if (Array.isArray(keywords)) {
                    for (const kw of keywords) {
                        if (typeof kw !== 'string' || !kw) continue;
                        items.push({
                            label: kw,
                            kind: monaco.languages.CompletionItemKind.Keyword,
                            insertText: kw,
                            detail: t('Editor.Completion.Keyword'),
                            sortText: '2_' + kw,
                            range,
                        });
                    }
                }

                if (syntaxList.length) {
                    const hasColumnContext = syntaxList.some(s => s.syntaxContextType === 'column');
                    const hasTableContext = syntaxList.some(s => s.syntaxContextType === 'table');
                    const hasDatabaseContext = syntaxList.some(s => s.syntaxContextType === 'database' || s.syntaxContextType === 'databaseCreate');

                    if (hasTableContext) {
                        const tableSyntax = syntaxList.find(s => s.syntaxContextType === 'table');
                        const typedTablePrefix = completionTextFromWordRanges(tableSyntax?.wordRanges, currentWord);
                        const normalizedPrefix = (typedTablePrefix ?? '').toLowerCase();

                        const hasQualifierPrefix = typedTablePrefix.includes('.');
                        const qualifierPrefixRaw = hasQualifierPrefix ? typedTablePrefix.split('.')[0] : '';
                        const qualifierPrefixLower = qualifierPrefixRaw.toLowerCase();
                        const activeDbLower = activeDb?.toLowerCase?.() ?? '';

                        const isCrossDbPrefix = !isPostgres && hasQualifierPrefix && !!qualifierPrefixLower && !!activeDbLower && qualifierPrefixLower !== activeDbLower;

                        if (tables.length && !isCrossDbPrefix) {
                            for (const table of tables) {
                                const tableName = resolveTableName(table);
                                const tableDisplayName = resolveTableDisplayName(table) || tableName;
                                if (!tableName) continue;

                                if (isPostgres) {
                                    const qualifiedTable = resolveSchemaQualifiedTable(tableName);
                                    const normalizedTableName = qualifiedTable.tableName.toLowerCase();
                                    const normalizedDisplayName = tableDisplayName.toLowerCase();

                                    if (hasQualifierPrefix) {
                                        const typedTableParts = typedTablePrefix.split('.');
                                        const schemaPrefix = (typedTableParts[0] ?? '').toLowerCase();
                                        const tablePrefix = typedTableParts.slice(1).join('.').toLowerCase();

                                        if (qualifiedTable.schemaName.toLowerCase() !== schemaPrefix) continue;
                                        if (tablePrefix && !normalizedTableName.startsWith(tablePrefix) && !normalizedDisplayName.startsWith(tablePrefix)) continue;
                                    } else if (normalizedPrefix && !tableName.toLowerCase().startsWith(normalizedPrefix) && !normalizedDisplayName.startsWith(normalizedPrefix)) {
                                        continue;
                                    }
                                } else if (
                                    !hasQualifierPrefix &&
                                    normalizedPrefix &&
                                    !tableName.toLowerCase().startsWith(normalizedPrefix) &&
                                    !tableDisplayName.toLowerCase().startsWith(normalizedPrefix)
                                ) {
                                    continue;
                                }

                                items.push({
                                    label: tableDisplayName,
                                    kind: monaco.languages.CompletionItemKind.Class,
                                    insertText: tableName,
                                    detail: t('Editor.Completion.Table'),
                                    sortText: '1_' + tableDisplayName,
                                    range,
                                });
                            }
                        }

                        if (isPostgres) {
                            const normalizedSchemaPrefix = (qualifierPrefixRaw || typedTablePrefix || currentWord).toLowerCase();

                            for (const schema of schemas) {
                                const schemaName = resolveSchemaName(schema);
                                if (!schemaName) continue;
                                if (normalizedSchemaPrefix && !schemaName.toLowerCase().startsWith(normalizedSchemaPrefix)) continue;

                                items.push({
                                    label: schemaName,
                                    kind: monaco.languages.CompletionItemKind.Module,
                                    insertText: schemaName,
                                    detail: t('Editor.Completion.Database'),
                                    sortText: '1z_' + schemaName,
                                    range,
                                });
                            }
                        } else if (databases.length) {
                            const normalizedDbPrefix = (qualifierPrefixRaw || typedTablePrefix || currentWord).toLowerCase();

                            for (const db of databases) {
                                const dbName = resolveDatabaseName(db);
                                if (!dbName) continue;
                                if (normalizedDbPrefix && !dbName.toLowerCase().startsWith(normalizedDbPrefix)) continue;

                                items.push({
                                    label: dbName,
                                    kind: monaco.languages.CompletionItemKind.Module,
                                    insertText: dbName,
                                    detail: t('Editor.Completion.Database'),
                                    sortText: '1z_' + dbName,
                                    range,
                                });
                            }
                        }
                    }

                    if (hasDatabaseContext) {
                        const databaseSyntax = syntaxList.find(s => s.syntaxContextType === 'database' || s.syntaxContextType === 'databaseCreate');
                        const typedDatabasePrefix = completionTextFromWordRanges(databaseSyntax?.wordRanges, currentWord);
                        const normalizedContextPrefix = (typedDatabasePrefix ?? '').toLowerCase();

                        if (isPostgres) {
                            for (const schema of schemas) {
                                const schemaName = resolveSchemaName(schema);
                                if (!schemaName) continue;
                                if (normalizedContextPrefix && !schemaName.toLowerCase().startsWith(normalizedContextPrefix)) continue;

                                items.push({
                                    label: schemaName,
                                    kind: monaco.languages.CompletionItemKind.Module,
                                    insertText: schemaName,
                                    detail: t('Editor.Completion.Database'),
                                    sortText: '1_' + schemaName,
                                    range,
                                });
                            }
                        } else if (databases.length) {
                            for (const db of databases) {
                                const dbName = resolveDatabaseName(db);
                                if (!dbName) continue;
                                if (normalizedContextPrefix && !dbName.toLowerCase().startsWith(normalizedContextPrefix)) continue;

                                items.push({
                                    label: dbName,
                                    kind: monaco.languages.CompletionItemKind.Module,
                                    insertText: dbName,
                                    detail: t('Editor.Completion.Database'),
                                    sortText: '1_' + dbName,
                                    range,
                                });
                            }
                        }
                    }

                    if (hasColumnContext) {
                        const rawPrefix = columnPrefix.trim();
                        let targetTables: string[] = [];
                        let filterPrefix = rawPrefix.toLowerCase();

                        const aliasMatch = rawPrefix.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.(.*)$/);
                        if (aliasMatch) {
                            const aliasPart = aliasMatch[1]; // c
                            const afterDotPart = aliasMatch[2];

                            const tableFromAlias = resolveTableFromAliasInSql(sql, aliasPart);
                            if (tableFromAlias) {
                                targetTables = [tableFromAlias];

                                filterPrefix = (afterDotPart || '').toLowerCase();
                            }
                        }

                        if (!targetTables.length) {
                            const caretOffset = model.getOffsetAt(position);
                            targetTables = resolveTablesForColumnContext(parser, sql, caretPos, tables, caretOffset);

                            if (!targetTables.length) {
                                targetTables = tables.map(t => normalizeTableName(resolveTableName(t))).filter(Boolean);
                            }
                        }

                        if (targetTables.length) {
                            const seen = new Set<string>();

                            for (const target of targetTables) {
                                const cols = (await getColumns(target)) ?? [];
                                for (const col of cols) {
                                    const colName = (col as any)?.columnName ?? (col as any)?.name;
                                    if (!colName || seen.has(colName)) continue;

                                    if (filterPrefix && !colName.toLowerCase().startsWith(filterPrefix)) continue;

                                    seen.add(colName);
                                    items.push({
                                        label: colName,
                                        kind: monaco.languages.CompletionItemKind.Field,
                                        insertText: colName,
                                        detail: t('Editor.Completion.Column', { table: target }),
                                        sortText: '1_' + colName,
                                        range,
                                    });
                                }
                            }
                        }
                    }
                }

                return { suggestions: dedupeCompletionItems(items) };
            } catch (err) {
                console.warn('dt-sql-parser completion normalization error:', err);
                return { suggestions: [] };
            }
        },
    });
};

const ensureMonacoWorkerFactory = () => {
    if (typeof window === 'undefined') {
        return;
    }

    const globalScope = globalThis as typeof globalThis & {
        MonacoEnvironment?: MonacoEnvironmentConfig;
    };

    if (typeof globalScope.MonacoEnvironment?.getWorker === 'function') {
        return;
    }

    globalScope.MonacoEnvironment = {
        ...globalScope.MonacoEnvironment,
        getWorker: () => {
            return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), {
                type: 'module',
                name: 'dory-monaco-editor-worker',
            });
        },
    };
};

export function useSqlMonacoEditor({
    tabs,
    activeTab,
    workspaceActive,
    editorTheme,
    editorSettings,
    currentConnectionId,
    currentConnectionType,
    containerRef,
    onContentChange,
    onRunQuery,
    onNewTab,
    onInlineAskOpen,
    onFormat,
}: UseSqlMonacoEditorProps) {
    const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
    const modelsByTabRef = useRef(new Map<string, SqlModelEntry>());
    const tabsRef = useRef(tabs);
    const activeTabIdRef = useRef<string | null>(null);
    const workspaceActiveRef = useRef(workspaceActive);
    const onContentChangeRef = useRef(onContentChange);
    const updateInlineAskPlaceholdersRef = useRef<() => void>(() => undefined);
    const [editorGeneration, setEditorGeneration] = useState(0);
    const tablesRef = useRef<any[]>([]);
    const activeDatabaseRef = useRef<string>('');
    const databasesRef = useRef<any[]>([]);
    const schemasRef = useRef<any[]>([]);
    const onRunQueryRef = useRef(onRunQuery);
    const onNewTabRef = useRef(onNewTab);
    const onInlineAskOpenRef = useRef(onInlineAskOpen);
    const onFormatRef = useRef(onFormat);
    const editorThemeRef = useRef(editorTheme);
    const editorSettingsRef = useRef(editorSettings);

    const activeDatabase = useAtomValue(activeDatabaseAtom);
    const setSelectionByTab = useSetAtom(editorSelectionByTabAtom);
    const { databases } = useDatabases();
    const { tables } = useTables(activeDatabase);
    const { schemas } = useSchemas(activeDatabase, isPostgresFamilyConnectionType(currentConnectionType));
    const { refresh: refreshColumns } = useColumns();
    const refreshColumnsRef = useRef(refreshColumns);
    const t = useTranslations('SqlConsole');

    useEffect(() => {
        tablesRef.current = tables || [];
    }, [tables]);

    useEffect(() => {
        databasesRef.current = databases || [];
    }, [databases]);

    useEffect(() => {
        schemasRef.current = schemas || [];
    }, [schemas]);

    useEffect(() => {
        activeDatabaseRef.current = activeDatabase;
    }, [activeDatabase]);

    useEffect(() => {
        refreshColumnsRef.current = refreshColumns;
    }, [refreshColumns]);

    useEffect(() => {
        onRunQueryRef.current = onRunQuery;
    }, [onRunQuery]);

    useEffect(() => {
        onNewTabRef.current = onNewTab;
    }, [onNewTab]);

    useEffect(() => {
        onInlineAskOpenRef.current = onInlineAskOpen;
    }, [onInlineAskOpen]);

    useEffect(() => {
        onFormatRef.current = onFormat;
    }, [onFormat]);

    useEffect(() => {
        editorThemeRef.current = editorTheme;
    }, [editorTheme]);

    useEffect(() => {
        editorSettingsRef.current = editorSettings;
    }, [editorSettings]);

    useEffect(() => {
        workspaceActiveRef.current = workspaceActive;
    }, [workspaceActive]);

    useEffect(() => {
        onContentChangeRef.current = onContentChange;
    }, [onContentChange]);

    useEffect(() => {
        tabsRef.current = tabs;
    }, [tabs]);

    const fetchColumnsForCompletion = useCallback(async (tableName: string) => {
        const db = activeDatabaseRef.current;
        if (!db || !tableName) return [];
        try {
            const normalized = normalizeTableName(tableName);
            const res = await refreshColumnsRef.current?.(db, normalized);
            return res ?? [];
        } catch (error) {
            console.error('Failed to load columns for completion:', error);
            return [];
        }
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;

        const modelsByTab = modelsByTabRef.current;
        let disposed = false;
        let localEditor: Monaco.editor.IStandaloneCodeEditor | null = null;
        let dtCompletionDisposable: Monaco.IDisposable | null = null;
        let selectionDisposable: Monaco.IDisposable | null = null;
        const placeholderWidgets = new Map<number, Monaco.editor.IContentWidget>();

        (async () => {
            ensureMonacoWorkerFactory();
            const monaco = await import('monaco-editor');
            if (disposed || !containerRef.current) return;

            monacoRef.current = monaco;
            const dialectConfig = getSqlDialectConfigForConnectionType(currentConnectionType);
            const languageId = dialectConfig.monacoLanguageId;

            const parser = await getSqlDialectParser(dialectConfig.dialect);
            if (disposed || !containerRef.current) return;

            console.log(`[useSqlMonacoEditor] Loaded parser for dialect=${dialectConfig.dialect}`);

            monaco.editor.defineTheme('github-dark', vsPlusTheme.darkThemeData);
            monaco.editor.defineTheme('github-light', vsPlusTheme.lightThemeData);
            monaco.editor.setTheme(editorThemeRef.current);

            dtCompletionDisposable = registerDtSqlCompletion(
                monaco,
                languageId,
                parser,
                currentConnectionType,
                t,
                () => tablesRef.current,
                fetchColumnsForCompletion,
                () => databasesRef.current,
                () => schemasRef.current,
                () => activeDatabaseRef.current,
            );

            if (disposed || !containerRef.current) return;

            const editorOptions = buildSqlEditorOptions(editorSettingsRef.current);
            localEditor = monaco.editor.create(containerRef.current, {
                model: null,
                automaticLayout: true,
                contextmenu: false,
                quickSuggestions: true,
                suggestOnTriggerCharacters: true,
                suggest: {
                    showIcons: true,
                    showInlineDetails: true,
                    showKeywords: true,
                    showFunctions: true,
                    showProperties: false,
                    showFields: true,
                    showVariables: true,
                },
                ...editorOptions,
            });

            editorRef.current = localEditor;
            const createInlineAskPlaceholderWidget = (lineNumber: number, placeholder: string): Monaco.editor.IContentWidget => {
                const node = document.createElement('span');
                node.className = 'dory-sql-editor-inline-placeholder';
                node.style.display = 'inline-block';
                node.style.fontSize = `${localEditor?.getOption(monaco.editor.EditorOption.fontSize) ?? 12}px`;
                node.style.lineHeight = `${localEditor?.getOption(monaco.editor.EditorOption.lineHeight) ?? 18}px`;
                node.style.width = 'max-content';
                node.style.whiteSpace = 'nowrap';

                const [beforeSlash, afterSlash = ''] = placeholder.split('/');
                const prefix = document.createElement('span');
                prefix.textContent = beforeSlash.replaceAll(' ', '\u00a0');

                const slash = document.createElement('span');
                slash.className = 'dory-sql-editor-inline-placeholder-key';
                slash.textContent = '/';

                const suffix = document.createElement('span');
                suffix.textContent = afterSlash.replaceAll(' ', '\u00a0');

                node.append(prefix, slash, suffix);

                return {
                    suppressMouseDown: true,
                    getId: () => `dory.sql-editor.inline-ask-placeholder.${lineNumber}`,
                    getDomNode: () => node,
                    getPosition: () => ({
                        position: { lineNumber, column: 1 },
                        preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
                    }),
                };
            };
            const updateInlineAskPlaceholders = () => {
                const editor = localEditor;
                const model = editor?.getModel();
                const selection = editor?.getSelection();
                if (!editor || !model || !selection) return;

                const lineNumber = selection.startLineNumber;
                const placeholder = t('InlineAsk.EditorPlaceholder');
                const shouldShowPlaceholder = !model.getLineContent(lineNumber).trim();

                if (shouldShowPlaceholder) {
                    const widget = placeholderWidgets.get(lineNumber);
                    if (widget) {
                        editor.layoutContentWidget(widget);
                    } else {
                        const nextWidget = createInlineAskPlaceholderWidget(lineNumber, placeholder);
                        placeholderWidgets.set(lineNumber, nextWidget);
                        editor.addContentWidget(nextWidget);
                    }
                }

                for (const [widgetLineNumber, widget] of placeholderWidgets) {
                    if (shouldShowPlaceholder && widgetLineNumber === lineNumber) continue;
                    editor.removeContentWidget(widget);
                    placeholderWidgets.delete(widgetLineNumber);
                }
            };
            updateInlineAskPlaceholdersRef.current = updateInlineAskPlaceholders;
            updateInlineAskPlaceholders();
            localEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                if (!workspaceActiveRef.current) return;
                onRunQueryRef.current?.();
            });
            localEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyL, () => {
                if (!workspaceActiveRef.current) return;
                onNewTabRef.current?.();
            });
            localEditor.addCommand(monaco.KeyCode.Slash, () => {
                if (!workspaceActiveRef.current) return;
                const editor = localEditor;
                if (!editor) return;

                const model = editor.getModel();
                const selection = editor.getSelection();
                const lineNumber = selection?.startLineNumber ?? 1;
                if (!model || !selection || model.getLineContent(lineNumber).trim()) {
                    editor.trigger('keyboard', 'type', { text: '/' });
                    return;
                }

                onInlineAskOpenRef.current?.();
            });
            localEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
                if (!workspaceActiveRef.current) return;
                onFormatRef.current?.();
            });
            selectionDisposable = localEditor.onDidChangeCursorSelection(() => {
                updateInlineAskPlaceholders();

                const model = localEditor?.getModel();
                const selection = localEditor?.getSelection();
                const tabId = activeTabIdRef.current;
                if (!model || !selection || !tabId) return;

                const startOffset = model.getOffsetAt({
                    lineNumber: selection.startLineNumber,
                    column: selection.startColumn,
                });
                const endOffset = model.getOffsetAt({
                    lineNumber: selection.endLineNumber,
                    column: selection.endColumn,
                });
                const start = Math.min(startOffset, endOffset);
                const end = Math.max(startOffset, endOffset);
                const nextSelection = end > start ? { start, end } : null;

                setSelectionByTab(prev => {
                    const current = prev[tabId] ?? null;
                    if (current?.start === nextSelection?.start && current?.end === nextSelection?.end) return prev;
                    return { ...prev, [tabId]: nextSelection };
                });
            });
            setEditorGeneration(value => value + 1);
        })();

        return () => {
            disposed = true;
            selectionDisposable?.dispose();
            for (const widget of placeholderWidgets.values()) {
                localEditor?.removeContentWidget(widget);
            }
            placeholderWidgets.clear();
            updateInlineAskPlaceholdersRef.current = () => undefined;
            dtCompletionDisposable?.dispose();
            localEditor?.setModel(null);
            for (const entry of modelsByTab.values()) {
                entry.changeDisposable.dispose();
                entry.model.dispose();
            }
            modelsByTab.clear();
            activeTabIdRef.current = null;
            localEditor?.dispose();
            editorRef.current = null;
            monacoRef.current = null;
        };
    }, [containerRef, currentConnectionId, currentConnectionType, fetchColumnsForCompletion, setSelectionByTab, t]);

    useEffect(() => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        if (!editor || !monaco) return;

        const sqlTabs = tabs.filter(tab => tab.tabType === 'sql');
        const liveTabIds = new Set(sqlTabs.map(tab => tab.tabId));
        const languageId = getSqlDialectConfigForConnectionType(currentConnectionType).monacoLanguageId;

        for (const tab of sqlTabs) {
            const externalContent = tab.content ?? '';
            let entry = modelsByTabRef.current.get(tab.tabId);

            if (!entry) {
                const connectionKey = encodeURIComponent(currentConnectionId ?? 'connection');
                const tabKey = encodeURIComponent(tab.tabId);
                const model = monaco.editor.createModel(externalContent, languageId, monaco.Uri.parse(`dory-sql://${connectionKey}/${tabKey}.sql`));
                const nextEntry: SqlModelEntry = {
                    model,
                    changeDisposable: { dispose: () => undefined },
                    viewState: null,
                    lastExternalContent: externalContent,
                    suppressChange: false,
                };
                nextEntry.changeDisposable = model.onDidChangeContent(() => {
                    if (nextEntry.suppressChange) return;
                    onContentChangeRef.current(tab.tabId, model.getValue());
                    if (activeTabIdRef.current === tab.tabId) {
                        updateInlineAskPlaceholdersRef.current();
                    }
                });
                modelsByTabRef.current.set(tab.tabId, nextEntry);
                entry = nextEntry;
            } else if (entry.lastExternalContent !== externalContent) {
                entry.lastExternalContent = externalContent;
                if (entry.model.getValue() !== externalContent) {
                    entry.suppressChange = true;
                    try {
                        entry.model.pushEditOperations([], [{ range: entry.model.getFullModelRange(), text: externalContent }], () => null);
                    } finally {
                        entry.suppressChange = false;
                    }
                }
            }
        }

        for (const [tabId, entry] of modelsByTabRef.current) {
            if (liveTabIds.has(tabId)) continue;

            if (activeTabIdRef.current === tabId) {
                entry.viewState = editor.saveViewState();
                editor.setModel(null);
                activeTabIdRef.current = null;
            }
            entry.changeDisposable.dispose();
            entry.model.dispose();
            modelsByTabRef.current.delete(tabId);
        }

        setSelectionByTab(previous => {
            const next = Object.fromEntries(Object.entries(previous).filter(([tabId]) => liveTabIds.has(tabId)));
            return Object.keys(next).length === Object.keys(previous).length ? previous : next;
        });

        const nextTabId = activeTab?.tabType === 'sql' ? activeTab.tabId : null;
        const nextEntry = nextTabId ? modelsByTabRef.current.get(nextTabId) : undefined;
        if (!nextEntry || editor.getModel() === nextEntry.model) return;

        const previousTabId = activeTabIdRef.current;
        if (previousTabId) {
            const previousEntry = modelsByTabRef.current.get(previousTabId);
            if (previousEntry) {
                previousEntry.viewState = editor.saveViewState();
            }
        }

        activeTabIdRef.current = nextTabId;
        editor.setModel(nextEntry.model);
        if (nextEntry.viewState) {
            editor.restoreViewState(nextEntry.viewState);
        } else {
            const lastLine = nextEntry.model.getLineCount();
            const lastColumn = nextEntry.model.getLineMaxColumn(lastLine);
            editor.setPosition({ lineNumber: lastLine, column: lastColumn });
            editor.revealPositionInCenterIfOutsideViewport({ lineNumber: lastLine, column: lastColumn });
        }
        updateInlineAskPlaceholdersRef.current();
        if (workspaceActiveRef.current) {
            editor.focus();
        }
    }, [activeTab?.tabId, activeTab?.tabType, currentConnectionId, currentConnectionType, editorGeneration, setSelectionByTab, tabs]);

    useEffect(() => {
        if (workspaceActive) {
            editorRef.current?.focus();
        }
    }, [editorGeneration, workspaceActive]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.updateOptions({
            ...buildSqlEditorOptions(editorSettings),
            contextmenu: false,
        });
    }, [editorSettings]);

    const getModel = useCallback((tabId?: string) => {
        const targetTabId = tabId ?? activeTabIdRef.current;
        return targetTabId ? (modelsByTabRef.current.get(targetTabId)?.model ?? null) : null;
    }, []);

    const getValue = useCallback(
        (tabId?: string) => {
            const model = getModel(tabId);
            if (model) return model.getValue();

            const targetTabId = tabId ?? activeTabIdRef.current;
            const targetTab = tabsRef.current.find(tab => tab.tabId === targetTabId);
            return targetTab?.tabType === 'sql' ? (targetTab.content ?? '') : '';
        },
        [getModel],
    );

    const getValuesByTabId = useCallback(() => {
        return Object.fromEntries(Array.from(modelsByTabRef.current, ([tabId, entry]) => [tabId, entry.model.getValue()]));
    }, []);

    return { editorRef, monacoRef, getModel, getValue, getValuesByTabId, modelsByTabRef };
}
