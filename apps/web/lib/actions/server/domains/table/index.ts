import { tableGetProfileAction } from './profile';
import { tableGetIndexesAction } from './indexes';
import { tableGetPropertiesAction } from './properties';
import { tableGetStatsAction } from './stats';
import { tableGetDdlAction } from './ddl';
import { tablePreviewAction } from './preview';
import { tableCommitUpdatesAction } from './commit-updates';
import { tableExportCreateAction } from './export-create';
import { tableExportListAction } from './export-list';
import { tableExportCancelAction } from './export-cancel';

export const tableActions = [
    tableGetProfileAction,
    tableGetIndexesAction,
    tableGetPropertiesAction,
    tableGetStatsAction,
    tableGetDdlAction,
    tablePreviewAction,
    tableCommitUpdatesAction,
    tableExportCreateAction,
    tableExportListAction,
    tableExportCancelAction,
];
