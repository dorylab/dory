import type { CategoryKey } from './types';
import { AppearancePanel } from './AppearancePanel/AppearancePanel';
import { EditorPanel } from './EditorPanel/EditorPanel';
import { NotificationsPanel } from './NotificationsPanel';
import { DataPanel } from './DataPanel';
import { ShortcutsPanel } from './ShortcutsPanel';
import { SecurityPanel } from './SecurityPanel';
import { AboutPanel } from './AboutPanel';
import { AgentAccessPanel } from './AgentAccessPanel';

export function PanelByKey({ keyName }: { keyName: CategoryKey }) {
    switch (keyName) {
        case 'appearance':
            return <AppearancePanel />;
        case 'editor':
            return <EditorPanel />;
        case 'notifications':
            return <NotificationsPanel />;
        case 'data':
            return <DataPanel />;
        case 'agentAccess':
            return <AgentAccessPanel />;
        case 'shortcuts':
            return <ShortcutsPanel />;
        case 'security':
            return <SecurityPanel />;
        case 'about':
            return <AboutPanel />;
        default:
            return null;
    }
}
