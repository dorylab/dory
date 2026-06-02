import { tableGetProfileAction } from './profile';
import { tableGetIndexesAction } from './indexes';
import { tableGetPropertiesAction } from './properties';
import { tableGetStatsAction } from './stats';
import { tableGetDdlAction } from './ddl';
import { tablePreviewAction } from './preview';

export const tableActions = [tableGetProfileAction, tableGetIndexesAction, tableGetPropertiesAction, tableGetStatsAction, tableGetDdlAction, tablePreviewAction];
