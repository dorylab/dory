'use client';

import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';

const FONT_SIZE_KEY = 'app:font-size';
const DEFAULT_FONT_SIZE = '16px';
const FONT_SIZE_OPTIONS = [
    { label: 'Small', value: '14px' },
    { label: 'Default', value: '16px' },
    { label: 'Large', value: '18px' },
    // { label: 'Extra Large', value: '20px' },
];

function applyFontSize(value: string) {
    document.documentElement.style.setProperty('--app-font-size', value);
    document.documentElement.style.fontSize = value;
    if (document.body) {
        document.body.style.fontSize = value;
    }
}

export function FontSizeSelect() {
    const [value, setValue] = useState(DEFAULT_FONT_SIZE);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const stored = window.localStorage.getItem(FONT_SIZE_KEY);
        const nextValue = FONT_SIZE_OPTIONS.some(option => option.value === stored) ? stored : DEFAULT_FONT_SIZE;
        if (!nextValue) return;
        setValue(nextValue);
        applyFontSize(nextValue);
        setReady(true);
    }, []);

    useEffect(() => {
        if (!ready) return;
        applyFontSize(value);
        window.localStorage.setItem(FONT_SIZE_KEY, value);
    }, [ready, value]);

    return (
        <Select value={value} onValueChange={setValue}>
            <SelectTrigger className="h-8 w-[180px] justify-between">
                <SelectValue placeholder="Default" />
            </SelectTrigger>
            <SelectContent align="end">
                {FONT_SIZE_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
