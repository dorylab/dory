import assert from 'node:assert/strict';

import {
    buildDefaultSqlEditorResultLayout,
    DEFAULT_SQL_EDITOR_SETTINGS,
    normalizeSqlEditorSettings,
    resolveSqlEditorResultLayout,
} from '../../shared/stores/sql-editor-settings.store';

assert.equal(normalizeSqlEditorSettings().editorPanelHeight, 20);
assert.deepEqual(buildDefaultSqlEditorResultLayout(normalizeSqlEditorSettings()), [20, 80]);
assert.equal(normalizeSqlEditorSettings({ editorPanelHeight: 5 }).editorPanelHeight, 15);
assert.equal(normalizeSqlEditorSettings({ editorPanelHeight: 95 }).editorPanelHeight, 80);
assert.equal(normalizeSqlEditorSettings({ editorPanelHeight: 44.6 }).editorPanelHeight, 45);

const legacySettings = { ...DEFAULT_SQL_EDITOR_SETTINGS } as Partial<typeof DEFAULT_SQL_EDITOR_SETTINGS>;
delete legacySettings.editorPanelHeight;
assert.equal(normalizeSqlEditorSettings(legacySettings).editorPanelHeight, 20);

assert.deepEqual(buildDefaultSqlEditorResultLayout(normalizeSqlEditorSettings({ editorPanelHeight: 60 })), [60, 40]);
assert.deepEqual(resolveSqlEditorResultLayout(undefined, normalizeSqlEditorSettings({ editorPanelHeight: 60 })), [60, 40]);
assert.deepEqual(resolveSqlEditorResultLayout([35, 65], normalizeSqlEditorSettings({ editorPanelHeight: 60 })), [35, 65]);

console.log('SQL editor settings normalization passed.');
