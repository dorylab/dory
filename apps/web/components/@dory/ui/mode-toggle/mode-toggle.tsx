'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Button } from '@/registry/new-york-v4/ui/button';

export default function ModeToggle() {
    const { setTheme } = useTheme();
    const t = useTranslations('DoryUI');

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="cursor-pointer">
                    <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    <span className="sr-only">{t('ModeToggle.ToggleTheme')}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="right">
                <DropdownMenuItem className="cursor-pointer" onClick={() => setTheme('light')}>
                    {t('ModeToggle.Light')}
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" onClick={() => setTheme('dark')}>
                    {t('ModeToggle.Dark')}
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" onClick={() => setTheme('system')}>
                    {t('ModeToggle.System')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
