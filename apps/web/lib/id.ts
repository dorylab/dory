import { v4 as uuidv4, v7 as uuidv7 } from 'uuid';

/**
 * Entity primary keys: use UUID v7 (sortable, DB-friendly)
 * Used for user / team / datasource / audit / trace / chat / message, etc.
 */
export function newEntityId(): string {
    return uuidv7();
}

/**
 * Security tokens / sessions / reset links: use random UUID
 */
export function newTokenId(): string {
    return uuidv4();
}
