import { getPgliteClient } from './pglite';
import { getPostgresClient } from './pg';
import { getDatabaseProvider } from '../../provider';

export function getClient() {
    const t = getDatabaseProvider().toLowerCase();
    if (t === 'pglite') {
        return getPgliteClient();
    }
    return getPostgresClient();
}
