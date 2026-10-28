import { ActionRegistry } from '@dory/actions';

import { aiActions } from './domains/ai';
import { artifactActions } from './domains/artifact';
import { catalogActions } from './domains/catalog';
import { chartActions } from './domains/chart';
import { comparisonActions } from './domains/comparison';
import { connectionActions } from './domains/connection';
import { knowledgeActions } from './domains/knowledge';
import { queryActions } from './domains/query';
import { reportActions } from './domains/report';
import { resultSetActions } from './domains/result-set';
import { savedQueryActions } from './domains/saved-query';
import { schemaActions } from './domains/schema';
import { tabActions } from './domains/tab';
import { tableActions } from './domains/table';
import { workActions } from './domains/work';
import type { WebActionServices } from './types';

export const webActionRegistry = new ActionRegistry<WebActionServices>();

webActionRegistry.registerMany([
    ...connectionActions,
    ...queryActions,
    ...resultSetActions,
    ...schemaActions,
    ...tableActions,
    ...tabActions,
    ...savedQueryActions,
    ...chartActions,
    ...catalogActions,
    ...aiActions,
    ...artifactActions,
    ...comparisonActions,
    ...knowledgeActions,
    ...workActions,
    ...reportActions,
]);
