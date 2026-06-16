import { schemaListDatabasesAction } from './list-databases';
import { schemaListTablesAction } from './list-tables';
import { schemaListSchemasAction } from './list-schemas';
import { schemaGetAction } from './get';
import { schemaListViewsAction } from './list-views';
import { schemaListMaterializedViewsAction } from './list-materialized-views';
import { schemaListFunctionsAction } from './list-functions';
import { schemaGetFunctionDetailAction } from './get-function-detail';
import { schemaListSequencesAction } from './list-sequences';
import { schemaListExtensionsAction } from './list-extensions';
import { schemaDescribeTableAction } from './describe-table';
import { schemaSearchAction } from './search';
import { schemaGetDatabaseSummaryAction } from './summary';
import { schemaGetMonitoringSummaryAction } from './monitoring-summary';
import { schemaRenameTableAction } from './rename-table';

export const schemaActions = [
    schemaListDatabasesAction,
    schemaListTablesAction,
    schemaListSchemasAction,
    schemaGetAction,
    schemaListViewsAction,
    schemaListMaterializedViewsAction,
    schemaListFunctionsAction,
    schemaGetFunctionDetailAction,
    schemaListSequencesAction,
    schemaListExtensionsAction,
    schemaDescribeTableAction,
    schemaSearchAction,
    schemaGetDatabaseSummaryAction,
    schemaGetMonitoringSummaryAction,
    schemaRenameTableAction,
];
