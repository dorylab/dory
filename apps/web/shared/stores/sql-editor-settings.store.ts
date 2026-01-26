import { atomWithStorage, createJSONStorage } from 'jotai/utils';
import type * as Monaco from 'monaco-editor';

export type SqlEditorTheme = 'auto' | 'github-light' | 'github-dark' | 'vs' | 'vs-dark';
export type SqlEditorFontFamilyPreset =
    | 'monaco'
    | 'menlo'
    | 'consolas'
    | 'jetbrains-mono'
    | 'fira-code'
    | 'source-code-pro'
    | 'custom';

export type SqlEditorSettings = {
    theme: SqlEditorTheme;
    fontFamilyPreset: SqlEditorFontFamilyPreset;
    customFontFamily: string;
    fontSize: number;
    lineHeight: number;
    lineNumbers: Monaco.editor.LineNumbersType;
    minimap: boolean;
    wordWrap: Monaco.editor.IEditorOptions['wordWrap'];
    folding: boolean;
    queryLimit: number;
};

export const SQL_EDITOR_THEME_OPTIONS: Array<{ label: string; value: SqlEditorTheme }> = [
    { label: 'Auto (follow app)', value: 'auto' },
    { label: 'GitHub Light', value: 'github-light' },
    { label: 'GitHub Dark', value: 'github-dark' },
    { label: 'VS Light', value: 'vs' },
    { label: 'VS Dark', value: 'vs-dark' },
];

export const SQL_EDITOR_FONT_FAMILY_OPTIONS: Array<{ label: string; value: SqlEditorFontFamilyPreset; fontFamily: string }> = [
    { label: 'Monaco', value: 'monaco', fontFamily: 'Monaco, Menlo, Consolas, "Liberation Mono", monospace' },
    { label: 'Menlo', value: 'menlo', fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", monospace' },
    { label: 'Consolas', value: 'consolas', fontFamily: 'Consolas, Monaco, Menlo, "Liberation Mono", monospace' },
    { label: 'JetBrains Mono', value: 'jetbrains-mono', fontFamily: '"JetBrains Mono", Monaco, Menlo, Consolas, monospace' },
    { label: 'Fira Code', value: 'fira-code', fontFamily: '"Fira Code", Monaco, Menlo, Consolas, monospace' },
    { label: 'Source Code Pro', value: 'source-code-pro', fontFamily: '"Source Code Pro", Monaco, Menlo, Consolas, monospace' },
    { label: 'Custom', value: 'custom', fontFamily: '' },
];

export const SQL_EDITOR_QUERY_LIMIT_OPTIONS = [100, 200, 500, 1000, 2000, 5000];

export const DEFAULT_SQL_EDITOR_SETTINGS: SqlEditorSettings = {
    theme: 'auto',
    fontFamilyPreset: 'monaco',
    customFontFamily: '',
    fontSize: 14,
    lineHeight: 1.5,
    lineNumbers: 'on',
    minimap: false,
    wordWrap: 'on',
    folding: true,
    queryLimit: 200,
};

const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 24;
const LINE_HEIGHT_MIN = 1.1;
const LINE_HEIGHT_MAX = 2.2;
const themeSet = new Set(SQL_EDITOR_THEME_OPTIONS.map(option => option.value));
const fontSet = new Set(SQL_EDITOR_FONT_FAMILY_OPTIONS.map(option => option.value));
const lineNumbersSet = new Set<SqlEditorSettings['lineNumbers']>(['on', 'off']);
const wordWrapSet = new Set<SqlEditorSettings['wordWrap']>(['on', 'off']);
const queryLimitSet = new Set(SQL_EDITOR_QUERY_LIMIT_OPTIONS);

const storage = createJSONStorage<SqlEditorSettings>(() => localStorage);
export const sqlEditorSettingsAtom = atomWithStorage<SqlEditorSettings>('sqlEditor.settings', DEFAULT_SQL_EDITOR_SETTINGS, storage);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const normalizeSqlEditorSettings = (value?: Partial<SqlEditorSettings> | null): SqlEditorSettings => {
    const next = value ?? {};
    const theme = themeSet.has(next.theme as SqlEditorTheme) ? (next.theme as SqlEditorTheme) : DEFAULT_SQL_EDITOR_SETTINGS.theme;
    const fontFamilyPreset = fontSet.has(next.fontFamilyPreset as SqlEditorFontFamilyPreset)
        ? (next.fontFamilyPreset as SqlEditorFontFamilyPreset)
        : DEFAULT_SQL_EDITOR_SETTINGS.fontFamilyPreset;
    const fontSize = clamp(Number(next.fontSize ?? DEFAULT_SQL_EDITOR_SETTINGS.fontSize), FONT_SIZE_MIN, FONT_SIZE_MAX);
    const lineHeight = clamp(Number(next.lineHeight ?? DEFAULT_SQL_EDITOR_SETTINGS.lineHeight), LINE_HEIGHT_MIN, LINE_HEIGHT_MAX);
    const rawQueryLimit = Number(next.queryLimit ?? DEFAULT_SQL_EDITOR_SETTINGS.queryLimit);
    const queryLimit = queryLimitSet.has(rawQueryLimit) ? rawQueryLimit : DEFAULT_SQL_EDITOR_SETTINGS.queryLimit;

    return {
        theme,
        fontFamilyPreset,
        customFontFamily: typeof next.customFontFamily === 'string' ? next.customFontFamily : DEFAULT_SQL_EDITOR_SETTINGS.customFontFamily,
        fontSize: Number.isFinite(fontSize) ? Math.round(fontSize) : DEFAULT_SQL_EDITOR_SETTINGS.fontSize,
        lineHeight: Number.isFinite(lineHeight) ? lineHeight : DEFAULT_SQL_EDITOR_SETTINGS.lineHeight,
        lineNumbers: lineNumbersSet.has(next.lineNumbers as SqlEditorSettings['lineNumbers'])
            ? (next.lineNumbers as SqlEditorSettings['lineNumbers'])
            : DEFAULT_SQL_EDITOR_SETTINGS.lineNumbers,
        minimap: typeof next.minimap === 'boolean' ? next.minimap : DEFAULT_SQL_EDITOR_SETTINGS.minimap,
        wordWrap: wordWrapSet.has(next.wordWrap as SqlEditorSettings['wordWrap'])
            ? (next.wordWrap as SqlEditorSettings['wordWrap'])
            : DEFAULT_SQL_EDITOR_SETTINGS.wordWrap,
        folding: typeof next.folding === 'boolean' ? next.folding : DEFAULT_SQL_EDITOR_SETTINGS.folding,
        queryLimit,
    };
};

export const resolveSqlEditorTheme = (settings: SqlEditorSettings, appTheme?: string) => {
    const normalized = normalizeSqlEditorSettings(settings);
    if (normalized.theme !== 'auto') return normalized.theme;
    return appTheme === 'dark' ? 'github-dark' : 'github-light';
};

export const resolveSqlEditorFontFamily = (settings: SqlEditorSettings) => {
    const normalized = normalizeSqlEditorSettings(settings);
    if (normalized.fontFamilyPreset === 'custom') {
        const custom = normalized.customFontFamily.trim();
        if (custom) return custom;
    }
    const match = SQL_EDITOR_FONT_FAMILY_OPTIONS.find(option => option.value === normalized.fontFamilyPreset);
    if (match?.fontFamily) return match.fontFamily;
    const fallback = SQL_EDITOR_FONT_FAMILY_OPTIONS.find(option => option.value === DEFAULT_SQL_EDITOR_SETTINGS.fontFamilyPreset);
    return fallback?.fontFamily ?? 'Monaco, Menlo, Consolas, "Liberation Mono", monospace';
};

export const buildSqlEditorOptions = (settings: SqlEditorSettings) => {
    const normalized = normalizeSqlEditorSettings(settings);
    const lineHeightPx = Math.round(normalized.fontSize * normalized.lineHeight);
    return {
        fontFamily: resolveSqlEditorFontFamily(normalized),
        fontSize: normalized.fontSize,
        lineHeight: Number.isFinite(lineHeightPx) && lineHeightPx > 0 ? lineHeightPx : undefined,
        lineNumbers: normalized.lineNumbers,
        minimap: { enabled: normalized.minimap },
        wordWrap: normalized.wordWrap,
        folding: normalized.folding,
    };
};
