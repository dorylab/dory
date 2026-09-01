import { artifactChartCreateAction } from './chart-create';
import { artifactChartUpdateAction } from './chart-update';
import { artifactDeleteAction } from './delete';
import { artifactGetAction } from './get';
import { artifactListAction } from './list';
import { artifactPinAction } from './pin';
import { artifactRenameAction } from './rename';
import { artifactUnpinAction } from './unpin';

export const artifactActions = [
    artifactListAction,
    artifactGetAction,
    artifactRenameAction,
    artifactDeleteAction,
    artifactPinAction,
    artifactUnpinAction,
    artifactChartCreateAction,
    artifactChartUpdateAction,
];
