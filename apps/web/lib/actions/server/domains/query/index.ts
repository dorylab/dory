import { queryExecuteAction } from './execute';
import { queryReadOnlyExecuteAction } from './read-only-execute';
import { queryCancelAction } from './cancel';
import { queryAuditSearchAction } from './audit-search';
import { queryResultSetViewStateUpdateAction } from './result-set-view-state-update';
import { queryResultSetsListAction } from './result-sets-list';
import { querySessionGetAction } from './session-get';

export const queryActions = [
    queryExecuteAction,
    queryReadOnlyExecuteAction,
    queryCancelAction,
    queryAuditSearchAction,
    querySessionGetAction,
    queryResultSetsListAction,
    queryResultSetViewStateUpdateAction,
];
