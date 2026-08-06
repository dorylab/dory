import type { TableContextTarget } from '@/components/table-context-menu/types';

const SQL_CONSOLE_HANDOFF_KEY = 'sql-console:pending-table-action';

export type SqlConsoleTableHandoff =
    | {
          id: string;
          connectionId: string;
          kind: 'new-query';
      }
    | {
          id: string;
          connectionId: string;
          kind: 'quick-query';
          target: TableContextTarget;
      };

type SqlConsoleTableHandoffInput =
    | {
          connectionId: string;
          kind: 'new-query';
      }
    | {
          connectionId: string;
          kind: 'quick-query';
          target: TableContextTarget;
      };

export function writeSqlConsoleTableHandoff(action: SqlConsoleTableHandoffInput) {
    const payload = { ...action, id: crypto.randomUUID() } as SqlConsoleTableHandoff;
    sessionStorage.setItem(SQL_CONSOLE_HANDOFF_KEY, JSON.stringify(payload));
}

export function consumeSqlConsoleTableHandoff(connectionId: string): SqlConsoleTableHandoff | null {
    const raw = sessionStorage.getItem(SQL_CONSOLE_HANDOFF_KEY);
    if (!raw) return null;

    sessionStorage.removeItem(SQL_CONSOLE_HANDOFF_KEY);
    try {
        const parsed = JSON.parse(raw) as Partial<SqlConsoleTableHandoff>;
        if (!parsed.id || parsed.connectionId !== connectionId || (parsed.kind !== 'new-query' && parsed.kind !== 'quick-query')) return null;
        if (parsed.kind === 'quick-query' && !parsed.target) return null;
        return parsed as SqlConsoleTableHandoff;
    } catch {
        return null;
    }
}
