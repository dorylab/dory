'use client';

import { useThemeConfig } from '@/components/active-theme';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';

const DEFAULT_THEMES = [
    { name: 'Default', value: 'default' },
    { name: 'Blue', value: 'blue' },
    { name: 'Green', value: 'green' },
    { name: 'Amber', value: 'amber' },
    { name: 'Liquid', value: 'liquid' },

];

const SCALED_THEMES = [
    { name: 'Default', value: 'default-scaled' },
    { name: 'Blue', value: 'blue-scaled' },
    { name: 'Liquid', value: 'liquid-scaled' },
];

const MONO_THEMES = [{ name: 'Mono', value: 'mono-scaled' }];

export function ThemeSelector({ compact = false }: { compact?: boolean }) {
    const { activeTheme, setActiveTheme } = useThemeConfig();

    return (
        <Select value={activeTheme} onValueChange={setActiveTheme}>
            <SelectTrigger id="theme-selector" className={compact ? 'h-8 w-[160px] justify-between' : 'justify-start'}>
                <SelectValue placeholder="Select a theme" />
            </SelectTrigger>
            <SelectContent align="end">
                <SelectGroup>
                    <SelectLabel>Default</SelectLabel>
                    {DEFAULT_THEMES.map(t => (
                        <SelectItem key={t.value} value={t.value}>
                            {t.name}
                        </SelectItem>
                    ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                    <SelectLabel>Scaled</SelectLabel>
                    {SCALED_THEMES.map(t => (
                        <SelectItem key={t.value} value={t.value}>
                            {t.name}
                        </SelectItem>
                    ))}
                </SelectGroup>
                <SelectGroup>
                    <SelectLabel>Monospaced</SelectLabel>
                    {MONO_THEMES.map(t => (
                        <SelectItem key={t.value} value={t.value}>
                            {t.name}
                        </SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    );
}
