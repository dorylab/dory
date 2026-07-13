import { ActionRegistry } from '@dory/actions';
import type { WebActionServices } from './types';
import { aiActions } from './domains/ai';
import { chartActions } from './domains/chart';
import { connectionActions } from './domains/connection';
import { queryActions } from './domains/query';
import { resultSetActions } from './domains/result-set';
import { savedQueryActions } from './domains/saved-query';
import { schemaActions } from './domains/schema';
import { tabActions } from './domains/tab';
import { tableActions } from './domains/table';

export const webActionRegistry = new ActionRegistry<WebActionServices>();

webActionRegistry.registerMany([...connectionActions, ...queryActions, ...resultSetActions, ...schemaActions, ...tableActions, ...tabActions, ...savedQueryActions, ...chartActions, ...aiActions]);
