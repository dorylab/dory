import { queryExecuteAction } from './execute';
import { queryReadOnlyExecuteAction } from './read-only-execute';
import { queryCancelAction } from './cancel';
import { queryAuditSearchAction } from './audit-search';

export const queryActions = [queryExecuteAction, queryReadOnlyExecuteAction, queryCancelAction, queryAuditSearchAction];
