'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { useTheme } from 'next-themes';

export function ThemeModeSelect() {
    const { theme, setTheme } = useTheme();
    const val = (theme as string) || 'system';
    return (
        <Select value={val} onValueChange={setTheme}>
            <SelectTrigger className="h-8 w-[180px] justify-between">
                <SelectValue placeholder="System" />
            </SelectTrigger>
            <SelectContent align="end">
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
        </Select>
    );
}
