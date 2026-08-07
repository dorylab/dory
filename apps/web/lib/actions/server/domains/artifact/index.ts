import { artifactChartCreateAction } from './chart-create';
import { artifactChartUpdateAction } from './chart-update';
import { artifactGetAction } from './get';
import { artifactListAction } from './list';
import { artifactRenameAction } from './rename';

export const artifactActions = [artifactListAction, artifactGetAction, artifactRenameAction, artifactChartCreateAction, artifactChartUpdateAction];
