'use client';

import { useAtom } from 'jotai';
import { useTranslations } from 'next-intl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Switch } from '@/registry/new-york-v4/ui/switch';
import { SettingsRow } from '../SettingsRow';
import {
    SQL_EDITOR_FONT_FAMILY_OPTIONS,
    SQL_EDITOR_QUERY_LIMIT_NO_LIMIT_VALUE,
    SQL_EDITOR_QUERY_LIMIT_OPTIONS,
    SQL_EDITOR_THEME_OPTIONS,
    normalizeSqlEditorSettings,
    sqlEditorSettingsAtom,
} from '@/shared/stores/sql-editor-settings.store';

export function EditorPanel() {
    const [settings, setSettings] = useAtom(sqlEditorSettingsAtom);
    const t = useTranslations('DoryUI.Settings');

    const updateSettings = (patch: Partial<typeof settings>) => {
        setSettings(prev => normalizeSqlEditorSettings({ ...prev, ...patch }));
    };

    return (
        <div className="space-y-6 pb-10">
            <SettingsRow label={t('Editor.ThemeLabel')} description={t('Editor.ThemeDescription')}>
                <Select value={settings.theme} onValueChange={value => updateSettings({ theme: value as typeof settings.theme })}>
                    <SelectTrigger className="h-8 w-55 justify-between">
                        <SelectValue placeholder={t('Editor.ThemeOptions.auto')} />
                    </SelectTrigger>
                    <SelectContent align="end">
                        {SQL_EDITOR_THEME_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                                {t(`Editor.ThemeOptions.${option.value}`)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </SettingsRow>

            <SettingsRow label={t('Editor.FontFamilyLabel')} description={t('Editor.FontFamilyDescription')}>
                <Select
                    value={settings.fontFamilyPreset}
                    onValueChange={value => updateSettings({ fontFamilyPreset: value as typeof settings.fontFamilyPreset })}
                >
                    <SelectTrigger className="h-8 w-55 justify-between">
                        <SelectValue placeholder={t('Editor.FontFamilyOptions.monaco')} />
                    </SelectTrigger>
                    <SelectContent align="end">
                        {SQL_EDITOR_FONT_FAMILY_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                                {t(`Editor.FontFamilyOptions.${option.value}`)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </SettingsRow>

            {settings.fontFamilyPreset === 'custom' ? (
                <SettingsRow label={t('Editor.CustomFontLabel')} description={t('Editor.CustomFontDescription')}>
                    <Input
                        value={settings.customFontFamily}
                        onChange={event => updateSettings({ customFontFamily: event.target.value })}
                        placeholder={t('Editor.CustomFontPlaceholder')}
                        className="h-8 w-65"
                    />
                </SettingsRow>
            ) : null}

            <SettingsRow label={t('Editor.FontSizeLabel')} description={t('Editor.FontSizeDescription')}>
                <Input
                    type="number"
                    min={12}
                    max={24}
                    step={1}
                    value={settings.fontSize}
                    onChange={event => {
                        const next = Number(event.target.value);
                        if (Number.isFinite(next)) updateSettings({ fontSize: next });
                    }}
                    className="h-8 w-30"
                />
            </SettingsRow>

            <SettingsRow label={t('Editor.LineHeightLabel')} description={t('Editor.LineHeightDescription')}>
                <Input
                    type="number"
                    min={1.1}
                    max={2.2}
                    step={0.1}
                    value={settings.lineHeight}
                    onChange={event => {
                        const next = Number(event.target.value);
                        if (Number.isFinite(next)) updateSettings({ lineHeight: next });
                    }}
                    className="h-8 w-30"
                />
            </SettingsRow>

            <SettingsRow label={t('Editor.QueryLimitLabel')} description={t('Editor.QueryLimitDescription')}>
                <Select
                    value={settings.queryLimit === null ? SQL_EDITOR_QUERY_LIMIT_NO_LIMIT_VALUE : String(settings.queryLimit)}
                    onValueChange={value => updateSettings({ queryLimit: value === SQL_EDITOR_QUERY_LIMIT_NO_LIMIT_VALUE ? null : Number(value) })}
                >
                    <SelectTrigger className="h-8 w-35 justify-between">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                        <SelectItem value={SQL_EDITOR_QUERY_LIMIT_NO_LIMIT_VALUE}>No limit</SelectItem>
                        {SQL_EDITOR_QUERY_LIMIT_OPTIONS.map(option => (
                            <SelectItem key={option} value={String(option)}>
                                {option}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </SettingsRow>

            <SettingsRow label={t('Editor.LineNumbersLabel')} description={t('Editor.LineNumbersDescription')}>
                <Switch checked={settings.lineNumbers === 'on'} onCheckedChange={checked => updateSettings({ lineNumbers: checked ? 'on' : 'off' })} />
            </SettingsRow>

            <SettingsRow label={t('Editor.MinimapLabel')} description={t('Editor.MinimapDescription')}>
                <Switch checked={settings.minimap} onCheckedChange={checked => updateSettings({ minimap: checked })} />
            </SettingsRow>

            <SettingsRow label={t('Editor.WordWrapLabel')} description={t('Editor.WordWrapDescription')}>
                <Switch checked={settings.wordWrap === 'on'} onCheckedChange={checked => updateSettings({ wordWrap: checked ? 'on' : 'off' })} />
            </SettingsRow>

            <SettingsRow label={t('Editor.CodeFoldingLabel')} description={t('Editor.CodeFoldingDescription')}>
                <Switch checked={settings.folding} onCheckedChange={checked => updateSettings({ folding: checked })} />
            </SettingsRow>
        </div>
    );
}
