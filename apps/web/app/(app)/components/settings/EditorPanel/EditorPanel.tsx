'use client';

import { useAtom } from 'jotai';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Switch } from '@/registry/new-york-v4/ui/switch';
import { SettingsRow } from '../SettingsRow';
import {
    SQL_EDITOR_FONT_FAMILY_OPTIONS,
    SQL_EDITOR_QUERY_LIMIT_OPTIONS,
    SQL_EDITOR_THEME_OPTIONS,
    normalizeSqlEditorSettings,
    sqlEditorSettingsAtom,
} from '@/shared/stores/sql-editor-settings.store';

export function EditorPanel() {
    const [settings, setSettings] = useAtom(sqlEditorSettingsAtom);

    const updateSettings = (patch: Partial<typeof settings>) => {
        setSettings(prev => normalizeSqlEditorSettings({ ...prev, ...patch }));
    };

    return (
        <div className="space-y-6 pb-10">
            <SettingsRow label="Editor theme" description="Pick a color theme for SQL editor.">
                <Select value={settings.theme} onValueChange={value => updateSettings({ theme: value as typeof settings.theme })}>
                    <SelectTrigger className="h-8 w-55 justify-between">
                        <SelectValue placeholder="Auto" />
                    </SelectTrigger>
                    <SelectContent align="end">
                        {SQL_EDITOR_THEME_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </SettingsRow>

            <SettingsRow label="Font family" description="Choose a font for the editor.">
                <Select
                    value={settings.fontFamilyPreset}
                    onValueChange={value => updateSettings({ fontFamilyPreset: value as typeof settings.fontFamilyPreset })}
                >
                    <SelectTrigger className="h-8 w-55 justify-between">
                        <SelectValue placeholder="Monaco" />
                    </SelectTrigger>
                    <SelectContent align="end">
                        {SQL_EDITOR_FONT_FAMILY_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </SettingsRow>

            {settings.fontFamilyPreset === 'custom' ? (
                <SettingsRow label="Custom font" description="Enter a CSS font-family value.">
                    <Input
                        value={settings.customFontFamily}
                        onChange={event => updateSettings({ customFontFamily: event.target.value })}
                        placeholder='e.g. "JetBrains Mono", monospace'
                        className="h-8 w-65"
                    />
                </SettingsRow>
            ) : null}

            <SettingsRow label="Font size" description="Adjust the editor text size.">
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

            <SettingsRow label="Line height" description="Controls line spacing multiplier (1.1-2.2).">
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

            <SettingsRow label="Default query limit" description="Sets the default LIMIT for SQL runs.">
                <Select
                    value={String(settings.queryLimit)}
                    onValueChange={value => updateSettings({ queryLimit: Number(value) })}
                >
                    <SelectTrigger className="h-8 w-35 justify-between">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                        {SQL_EDITOR_QUERY_LIMIT_OPTIONS.map(option => (
                            <SelectItem key={option} value={String(option)}>
                                {option}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </SettingsRow>

            <SettingsRow label="Line numbers" description="Show or hide line numbers.">
                <Switch checked={settings.lineNumbers === 'on'} onCheckedChange={checked => updateSettings({ lineNumbers: checked ? 'on' : 'off' })} />
            </SettingsRow>

            <SettingsRow label="Minimap" description="Show the code minimap on the right.">
                <Switch checked={settings.minimap} onCheckedChange={checked => updateSettings({ minimap: checked })} />
            </SettingsRow>

            <SettingsRow label="Word wrap" description="Wrap long lines within the editor.">
                <Switch checked={settings.wordWrap === 'on'} onCheckedChange={checked => updateSettings({ wordWrap: checked ? 'on' : 'off' })} />
            </SettingsRow>

            <SettingsRow label="Code folding" description="Enable code folding controls.">
                <Switch checked={settings.folding} onCheckedChange={checked => updateSettings({ folding: checked })} />
            </SettingsRow>
        </div>
    );
}
