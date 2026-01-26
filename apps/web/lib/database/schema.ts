import { getDatabaseProvider } from './provider';
import * as postgresSchemas from './postgres/schemas';
// import * as sqliteSchemas from './sqlite/schemas';

const provider = getDatabaseProvider();
// const activeSchemas = provider === 'sqlite' ? sqliteSchemas : postgresSchemas;
const activeSchemas = postgresSchemas;

export const schema = activeSchemas.schema;

export const tabs = activeSchemas.tabs;
export const user = activeSchemas.user;
export const session = activeSchemas.session;
export const account = activeSchemas.account;
export const verification = activeSchemas.verification;
export const teams = activeSchemas?.teams;
export const ai_schema_cache = activeSchemas?.aiSchemaCache;

export type ActiveDBSchema = typeof activeSchemas.schema;
