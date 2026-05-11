import type { ElementType } from 'react';
import { Palette, Info, Code, Database, Bot } from 'lucide-react';

export type CategoryKey =
    | 'appearance'
    | 'editor'
    | 'notifications'
    | 'data'
    | 'agentAccess'
    | 'shortcuts'
    | 'security'
    | 'about';

export function getCategories(t: (key: string) => string): Array<{
    key: CategoryKey;
    label: string;
    icon: ElementType;
    title: string;
    description?: string;
    tag?: string;
}> {
    return [
        {
            key: 'appearance',
            label: t('Categories.Appearance.Label'),
            icon: Palette,
            title: t('Categories.Appearance.Title'),
            description: t('Categories.Appearance.Description'),
            tag: t('Categories.Appearance.Tag'),
        },
        {
            key: 'editor',
            label: t('Categories.Editor.Label'),
            icon: Code,
            title: t('Categories.Editor.Title'),
            description: t('Categories.Editor.Description'),
            tag: t('Categories.Editor.Tag'),
        },
        {
            key: 'data',
            label: t('Categories.Data.Label'),
            icon: Database,
            title: t('Categories.Data.Title'),
            description: t('Categories.Data.Description'),
        },
        {
            key: 'agentAccess',
            label: t('Categories.AgentAccess.Label'),
            icon: Bot,
            title: t('Categories.AgentAccess.Title'),
            description: t('Categories.AgentAccess.Description'),
        },
        // { key: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
        {
            key: 'about',
            label: t('Categories.About.Label'),
            icon: Info,
            title: t('Categories.About.Title'),
            description: t('Categories.About.Description'),
        },
    ];
}
