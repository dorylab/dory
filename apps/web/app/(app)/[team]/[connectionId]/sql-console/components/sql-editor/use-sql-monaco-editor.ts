'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type * as Monaco from 'monaco-editor';

import { vsPlusTheme } from '@/components/@dory/ui/monaco-editor/theme';
import { useColumns } from '@/hooks/use-columns';
import { useDatabases } from '@/hooks/use-databases';
import { useTables } from '@/hooks/use-tables';
import { registerSQLCompletion } from '@/lib/providers/monaco-providers';
import { activeDatabaseAtom } from '@/shared/stores/app.store';
import { buildSqlEditorOptions, SqlEditorSettings } from '@/shared/stores/sql-editor-settings.store';
import { useAtomValue, useSetAtom } from 'jotai';
import type { UITabPayload } from '@/types/tabs';
import { buildColumnPrefix, normalizeTableName, resolveTableFromAliasInSql } from './utils';
import { editorSelectionByTabAtom } from '../../sql-console.store';
import { useTranslations } from 'next-intl';

const MAX_SQL_LEN_FOR_PARSE = 20000;
const languageId = 'mysql';

type ContentChangeHandler = (tabId: string, content: string) => void;

interface UseSqlMonacoEditorProps {
    activeTab: UITabPayload | undefined;
    editorTheme: string;
    editorSettings: SqlEditorSettings;
    currentConnectionId?: string;
    containerRef: RefObject<HTMLDivElement | null>;
    onContentChange: ContentChangeHandler;
    onRunQuery?: () => void;
    onFormat?: () => void;
}

const bindEditorChange = (editor: Monaco.editor.IStandaloneCodeEditor, tabId: string, onContentChange: ContentChangeHandler) => {
    return editor.onDidChangeModelContent(() => {
        const value = editor.getValue();
        onContentChange(tabId, value);
    });
};

const resolveTableName = (table: any) => {
    return (table?.value ?? table?.label ?? table?.name ?? table?.tableName ?? table?.table ?? '').toString();
};

const resolveDatabaseName = (database: any) => {
    return (database?.value ?? database?.label ?? database?.name ?? database?.databaseName ?? '').toString();
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
    parser: {
        getSuggestionAtCaretPosition: (sql: string, caretPos: { lineNumber: number; column: number }) => unknown;
        getAllEntities?: (sql: string, caretPos: { lineNumber: number; column: number }) => any[] | null;
    },
    t: ReturnType<typeof useTranslations>,
    getTables: () => any[],
    getColumns: (tableName: string) => Promise<any[] | undefined>,
    getDatabases: () => any[],
    getActiveDatabase?: () => string,
) => {
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
            const activeDb = getActiveDatabase?.() ?? '';

            const offset = model.getOffsetAt(position);
            const prefixText = sql.slice(0, offset);

            
            let suggestion: any = {};
            try {
                suggestion = parser.getSuggestionAtCaretPosition(sql, caretPos) || {};
            } catch (err) {
                console.warn('dt-sql-parser getSuggestionAtCaretPosition error:', err);
                suggestion = {};
            }

            const { keywords, syntax } = suggestion as {
                keywords?: string[];
                syntax?: { syntaxContextType: string; wordRanges: { text?: string }[] }[];
            };

            console.log('DT SQL Completion Suggestion:', suggestion);

            const items: Monaco.languages.CompletionItem[] = [];
            const syntaxList = Array.isArray(syntax) ? syntax : [];
            const columnPrefix = buildColumnPrefix(syntaxList, currentWord);

            
            if (Array.isArray(keywords)) {
                for (const kw of keywords) {
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
                    const typedTablePrefix =
                        (tableSyntax?.wordRanges ?? [])
                            .map(w => w?.text ?? '')
                            .join('')
                            .trim() || currentWord;
                    const normalizedPrefix = (typedTablePrefix ?? '').toLowerCase();

                    console.log('Table context detected, prefix:', typedTablePrefix);

                    const isDbPrefix = typedTablePrefix.includes('.');

                    
                    const dbPrefixRaw = isDbPrefix ? typedTablePrefix.split('.')[0] : '';
                    const dbPrefixLower = dbPrefixRaw.toLowerCase();
                    const activeDbLower = activeDb?.toLowerCase?.() ?? '';

                    
                    
                    const isCrossDbPrefix = isDbPrefix && !!dbPrefixLower && !!activeDbLower && dbPrefixLower !== activeDbLower;

                    
                    if (tables.length && !isCrossDbPrefix) {
                        for (const table of tables) {
                            const tableName = resolveTableName(table);
                            if (!tableName) continue;

                            
                            if (!isDbPrefix) {
                                if (normalizedPrefix && !tableName.toLowerCase().startsWith(normalizedPrefix)) continue;
                            }

                            items.push({
                                label: tableName,
                                kind: monaco.languages.CompletionItemKind.Class,
                                insertText: tableName,
                                detail: t('Editor.Completion.Table'),
                                sortText: '1_' + tableName,
                                range,
                            });
                        }
                    }

                    
                    if (databases.length) {
                        
                        const normalizedDbPrefix = (dbPrefixRaw || typedTablePrefix || currentWord).toLowerCase();

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

                
                if (hasDatabaseContext && databases.length) {
                    const databaseSyntax = syntaxList.find(s => s.syntaxContextType === 'database' || s.syntaxContextType === 'databaseCreate');
                    const typedDatabasePrefix =
                        (databaseSyntax?.wordRanges ?? [])
                            .map(w => w?.text ?? '')
                            .join('')
                            .trim() || currentWord;
                    const normalizedDbPrefix = (typedDatabasePrefix ?? '').toLowerCase();

                    for (const db of databases) {
                        const dbName = resolveDatabaseName(db);
                        if (!dbName) continue;
                        if (normalizedDbPrefix && !dbName.toLowerCase().startsWith(normalizedDbPrefix)) continue;

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

            return { suggestions: items };
        },
    });
};

export function useSqlMonacoEditor({
    activeTab,
    editorTheme,
    editorSettings,
    currentConnectionId,
    containerRef,
    onContentChange,
    onRunQuery,
    onFormat,
}: UseSqlMonacoEditorProps) {
    const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
    const dtCompletionDisposableRef = useRef<Monaco.IDisposable | null>(null);
    const parserRef = useRef<any | null>(null);
    const tablesRef = useRef<any[]>([]);
    const activeDatabaseRef = useRef<string>('');
    const databasesRef = useRef<any[]>([]);
    const onRunQueryRef = useRef(onRunQuery);
    const onFormatRef = useRef(onFormat);
    const editorThemeRef = useRef(editorTheme);
    const editorSettingsRef = useRef(editorSettings);

    const activeDatabase = useAtomValue(activeDatabaseAtom);
    const setSelectionByTab = useSetAtom(editorSelectionByTabAtom);
    const { databases } = useDatabases();
    const { tables } = useTables(activeDatabase);
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
        activeDatabaseRef.current = activeDatabase;
    }, [activeDatabase]);

    useEffect(() => {
        refreshColumnsRef.current = refreshColumns;
    }, [refreshColumns]);

    useEffect(() => {
        onRunQueryRef.current = onRunQuery;
    }, [onRunQuery]);

    useEffect(() => {
        onFormatRef.current = onFormat;
    }, [onFormat]);

    useEffect(() => {
        editorThemeRef.current = editorTheme;
    }, [editorTheme]);

    useEffect(() => {
        editorSettingsRef.current = editorSettings;
    }, [editorSettings]);

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
        if (!activeTab || activeTab.tabType !== 'sql') return;
        if (!containerRef.current) return;

        let disposed = false;
        let localEditor: Monaco.editor.IStandaloneCodeEditor | null = null;
        let contentDisposable: Monaco.IDisposable | null = null;
        let selectionDisposable: Monaco.IDisposable | null = null;

        (async () => {
            const monaco = await import('monaco-editor');
            monacoRef.current = monaco;

            
            if (!parserRef.current) {
                const dt = await import('dt-sql-parser');
                
                parserRef.current = new dt.PostgreSQL();
            }
            const parser = parserRef.current;

            monaco.editor.defineTheme('github-dark', vsPlusTheme.darkThemeData);
            monaco.editor.defineTheme('github-light', vsPlusTheme.lightThemeData);
            monaco.editor.setTheme(editorThemeRef.current);

            try {
                registerSQLCompletion(monaco, currentConnectionId || '');
            } catch {
                
            }

            dtCompletionDisposableRef.current?.dispose();
            dtCompletionDisposableRef.current = registerDtSqlCompletion(
                monaco,
                parser,
                t,
                () => tablesRef.current,
                fetchColumnsForCompletion,
                () => databasesRef.current,
                () => activeDatabaseRef.current,
            );

            if (disposed || !containerRef.current) return;

            const editorOptions = buildSqlEditorOptions(editorSettingsRef.current);
            localEditor = monaco.editor.create(containerRef.current, {
                value: activeTab.tabType === 'sql' ? (activeTab.content ?? '') : '',
                language: languageId,
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
            localEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                onRunQueryRef.current?.();
            });
            localEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
                onFormatRef.current?.();
            });
            contentDisposable = bindEditorChange(localEditor, activeTab.tabId, onContentChange);
            selectionDisposable = localEditor.onDidChangeCursorSelection(() => {
                const model = localEditor?.getModel();
                const selection = localEditor?.getSelection();
                if (!model || !selection) return;

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
                    const current = prev[activeTab.tabId] ?? null;
                    if (current?.start === nextSelection?.start && current?.end === nextSelection?.end) return prev;
                    return { ...prev, [activeTab.tabId]: nextSelection };
                });
            });
        })();

        return () => {
            disposed = true;
            contentDisposable?.dispose();
            selectionDisposable?.dispose();
            dtCompletionDisposableRef.current?.dispose();
            dtCompletionDisposableRef.current = null;
            localEditor?.dispose();
            editorRef.current = null;
            setSelectionByTab(prev => {
                if (!prev[activeTab.tabId]) return prev;
                return { ...prev, [activeTab.tabId]: null };
            });
        };
    }, [activeTab?.tabId, activeTab?.tabType, containerRef, currentConnectionId, onContentChange, setSelectionByTab, t]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.updateOptions({
            ...buildSqlEditorOptions(editorSettings),
            contextmenu: false,
        });
    }, [editorSettings]);

    return { editorRef, monacoRef };
}
