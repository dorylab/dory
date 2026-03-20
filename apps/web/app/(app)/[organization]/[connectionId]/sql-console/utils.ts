import { SQLTab } from "@/types/tabs";

export function shouldAutoNameTab(tab: SQLTab | undefined, options?: { defaultNames?: string[] }) {
    if (!tab) return false;
    
    if (tab.tabType !== 'sql') return false;

    
    if (!tab.tabName) return true;

    
    const baseNames = [
        'new query',
        'untitled query',
        ...(options?.defaultNames ?? []),
    ]
        .map(name => name?.trim())
        .filter(Boolean) as string[];

    const lower = tab.tabName.toLowerCase();
    return baseNames.some(name => {
        const normalized = name.toLowerCase();
        return lower === normalized || lower.startsWith(`${normalized} `) || lower.startsWith(`${normalized}-`);
    });
}
