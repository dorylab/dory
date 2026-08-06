import { type RefinementCtx } from 'zod';
import { UseFormReturn } from 'react-hook-form';
import { LocalDatabaseFileFields } from './shared';
import { buildLocalDatabasePath, DEFAULT_LOCAL_DATABASE_DIRECTORY, getDefaultLocalDatabaseFileName } from './local-database';

function isAbsolutePath(value: string) {
    return /^(\/|[a-zA-Z]:[\\/])/.test(value);
}

function parseConnectionOptions(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) };
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            return {};
        }
    }
    return {};
}

export function createSqliteConnectionDefaults() {
    return {
        type: 'sqlite',
        name: '',
        description: '',
        host: null,
        port: null,
        httpPort: null,
        ssl: false,
        database: 'main',
        path: '',
        localDatabaseSource: 'existing',
        localDatabaseFileName: getDefaultLocalDatabaseFileName('sqlite'),
        localDatabaseDirectory: DEFAULT_LOCAL_DATABASE_DIRECTORY,
        environment: '',
        tags: '',
    };
}

export function normalizeSqliteConnectionForForm(connection: any) {
    return {
        ...createSqliteConnectionDefaults(),
        ...connection,
        host: null,
        port: null,
        httpPort: null,
        ssl: false,
        database: connection?.database ?? 'main',
        path: connection?.path ?? '',
        localDatabaseSource: 'existing',
    };
}

export function normalizeSqliteConnectionForSubmit(connection: any) {
    const options = parseConnectionOptions(connection?.options);
    delete options.ssh;

    const { localDatabaseSource, localDatabaseFileName, localDatabaseDirectory, ...restConnection } = connection ?? {};

    return {
        ...restConnection,
        host: null,
        port: null,
        httpPort: null,
        ssl: false,
        database: connection?.database?.trim?.() || 'main',
        path: localDatabaseSource === 'new' ? buildLocalDatabasePath('sqlite', localDatabaseDirectory ?? '', localDatabaseFileName ?? '') : connection?.path?.trim?.() || '',
        options: JSON.stringify(options),
    };
}

export function validateSqliteConnection(value: any, ctx: RefinementCtx) {
    const normalizedPath = value?.path?.trim?.() ?? '';
    void ctx;
    void normalizedPath;
    void isAbsolutePath;
}

export function SqliteConnectionFields({ form, isEditMode }: { form: UseFormReturn<any>; isEditMode?: boolean }) {
    return <LocalDatabaseFileFields form={form} type="sqlite" isEditMode={isEditMode} />;
}
