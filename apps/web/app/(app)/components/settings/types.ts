import type { ElementType } from 'react';
import { Palette, Keyboard, Info, Code } from 'lucide-react';

export type CategoryKey =
    | 'appearance'
    | 'editor'
    | 'notifications'
    | 'data'
    | 'shortcuts'
    | 'security'
    | 'about';

export const CATEGORIES: Array<{
    key: CategoryKey;
    label: string;
    icon: ElementType;
    title: string;
    description?: string;
    tag?: string;
}> = [
    {
        key: 'appearance',
        label: 'Appearance',
        icon: Palette,
        title: 'Theme & Appearance',
        description: 'Control look and feel of the app.',
        tag: 'Theme',
    },
    {
        key: 'editor',
        label: 'Editor',
        icon: Code,
        title: 'Editor Settings',
        description: 'Customize the SQL editor appearance and behavior.',
        tag: 'SQL',
    },
    // { key: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
    {
        key: 'about',
        label: 'About',
        icon: Info,
        title: 'About',
        description: 'Version, licenses and credits.',
    },
];
