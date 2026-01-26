import * as tabsSchema from './tabs';
import * as authSchemaSchema from './auth-schema';
import * as chatSchema from './chat';
import * as auditSchema from './audit';
import * as teamSchema from './teams/teams';
import * as teamMemberSchema from './teams/team-members';
import * as connectionsSchema from './connections';
import * as aiSchemaCache from './ai-schema-cache';
import * as savedQueriesSchema from './saved-queries';


export * from './enums';
export * from './tabs';
export * from './auth-schema';
export * from './chat';
export * from './audit';
export * from './teams/team-members';
export * from './teams/teams';
export * from './connections';
export * from './ai-schema-cache';
export * from './saved-queries';

export const schema = {
    ...tabsSchema,
    ...authSchemaSchema,
    ...chatSchema,
    ...auditSchema,
    ...teamSchema,
    ...teamMemberSchema,
    ...connectionsSchema,
    ...aiSchemaCache,
    ...savedQueriesSchema,
};

export type DBSchema = typeof schema;
