import { SQLTab } from "@dory/shared/types/tabs";


export const DEFAULT_ACTIVE_TAB: SQLTab = {
    tabId: '1',
    tabName: 'Query 01',
    content: '',
    status: 'idle',
    tabType: 'sql',
    userId: '',
    connectionId: ''
};

export const DEFAULT_PGLITE_DB_PATH = '/app/data/dory';
export const DESKTOP_PGLITE_DB_PATH = './data/dory';
export const DEFAULT_TABLE_PREVIEW_LIMIT = 200;