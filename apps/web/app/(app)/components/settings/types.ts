import type { ElementType } from 'react';
import { Palette, Info, Code, Database, Bot, BadgeCheck, Building2, Cable, HardDrive } from 'lucide-react';

export type CategoryKey =
    | 'organization'
    | 'ai'
    | 'billing'
    | 'storage'
    | 'appearance'
    | 'editor'
    | 'notifications'
    | 'data'
    | 'agentAccess'
    | 'shortcuts'
    | 'security'
    | 'about';
export type CategoryGroupKey = 'person' | 'workspace' | 'about';

export type SettingsCategory = {
    key: CategoryKey;
    group: CategoryGroupKey;
    label: string;
    icon: ElementType;
    title: string;
    description?: string;
    tag?: string;
};

export function getCategories(
    t: (key: string) => string,
    options: {
        includeOrganizationSettings?: boolean;
        includeBillingSettings?: boolean;
    } = {},
): SettingsCategory[] {
    const workspaceCategories: SettingsCategory[] = options.includeOrganizationSettings
        ? [
              {
                  key: 'organization',
                  group: 'workspace',
                  label: t('Categories.Organization.Label'),
                  icon: Building2,
                  title: t('Categories.Organization.Title'),
                  description: t('Categories.Organization.Description'),
              },
              {
                  key: 'ai',
                  group: 'workspace',
                  label: t('Categories.Ai.Label'),
                  icon: Bot,
                  title: t('Categories.Ai.Title'),
                  description: t('Categories.Ai.Description'),
              },
              {
                  key: 'storage',
                  group: 'workspace',
                  label: t('Categories.Storage.Label'),
                  icon: HardDrive,
                  title: t('Categories.Storage.Title'),
                  description: t('Categories.Storage.Description'),
              },
              {
                  key: 'agentAccess',
                  group: 'person',
                  label: t('Categories.AgentAccess.Label'),
                  icon: Cable,
                  title: t('Categories.AgentAccess.Title'),
                  description: t('Categories.AgentAccess.Description'),
              },
              ...(options.includeBillingSettings
                  ? [
                        {
                            key: 'billing' as const,
                            group: 'workspace' as const,
                            label: t('Categories.Billing.Label'),
                            icon: BadgeCheck,
                            title: t('Categories.Billing.Title'),
                            description: t('Categories.Billing.Description'),
                        },
                    ]
                  : []),
          ]
        : [];

    return [
        {
            key: 'appearance',
            group: 'person',
            label: t('Categories.Appearance.Label'),
            icon: Palette,
            title: t('Categories.Appearance.Title'),
            description: t('Categories.Appearance.Description'),
            tag: t('Categories.Appearance.Tag'),
        },
        {
            key: 'editor',
            group: 'person',
            label: t('Categories.Editor.Label'),
            icon: Code,
            title: t('Categories.Editor.Title'),
            description: t('Categories.Editor.Description'),
            tag: t('Categories.Editor.Tag'),
        },
        {
            key: 'data',
            group: 'person',
            label: t('Categories.Data.Label'),
            icon: Database,
            title: t('Categories.Data.Title'),
            description: t('Categories.Data.Description'),
        },
        // { key: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
        {
            key: 'about',
            group: 'about',
            label: t('Categories.About.Label'),
            icon: Info,
            title: t('Categories.About.Title'),
            description: t('Categories.About.Description'),
        },
        ...workspaceCategories,
    ];
}
