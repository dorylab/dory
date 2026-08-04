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
export const invitation = activeSchemas.invitation;
export const subscription = activeSchemas.subscription;
export const organizations = activeSchemas?.organizations;
export const ai_schema_cache = activeSchemas?.aiSchemaCache;
export const mcpAccessTokens = activeSchemas?.mcpAccessTokens;
export const mcpAuthorizationRequests = activeSchemas?.mcpAuthorizationRequests;
export const localAiBridges = activeSchemas?.localAiBridges;
export const localAiJobs = activeSchemas?.localAiJobs;
export const fileAssets = activeSchemas?.fileAssets;
export const datasets = activeSchemas?.datasets;
export const datasetRelations = activeSchemas?.datasetRelations;
export const datasetRelationColumns = activeSchemas?.datasetRelationColumns;
export const organizationAiProviders = activeSchemas?.organizationAiProviders;
export const works = activeSchemas?.works;
export const workEvents = activeSchemas?.workEvents;
export const workQuerySessions = activeSchemas?.workQuerySessions;
export const workQueryResultSets = activeSchemas?.workQueryResultSets;
export const workChartStates = activeSchemas?.workChartStates;
export const queryRuns = activeSchemas?.queryRuns;
export const resultSets = activeSchemas?.resultSets;
export const agentRunResultSets = activeSchemas?.agentRunResultSets;
export const importRuns = activeSchemas?.importRuns;
export const importRunEvents = activeSchemas?.importRunEvents;

export type ActiveDBSchema = typeof activeSchemas.schema;
