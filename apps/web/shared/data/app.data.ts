import { SQLTab } from "@/types/tabs";


export const DEFAULT_ACTIVE_TAB: SQLTab = {
    tabId: '1',
    tabName: 'Query 01',
    content: '',
    status: 'idle',
    tabType: 'sql',
    userId: '',
    connectionId: ''
};

export const DEFAULT_PGLITE_DB_PATH = '/app/data/dory.db';