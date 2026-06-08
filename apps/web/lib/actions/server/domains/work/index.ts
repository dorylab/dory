import { workCreateAction } from './create';
import { workCreateInvestigationFindingAction } from './create-investigation-finding';
import { workGetAction } from './get';
import { workEnsureInvestigationWorkspaceAction } from './ensure-investigation-workspace';
import { workListAction } from './list';
import { workDeleteInvestigationFindingAction } from './delete-investigation-finding';
import { workUpdateConclusionAction } from './update-conclusion';
import { workUpdateGoalAction } from './update-goal';
import { workUpdateStatusAction } from './update-status';
import { workCreateInvestigationAction } from './create-investigation';
import { workGetRunEventResultAction } from './get-run-event-result';
import { workRunInvestigationSqlAction } from './run-investigation-sql';
import { workUpdateInvestigationFindingAction } from './update-investigation-finding';
import { workUpdateInvestigationAction } from './update-investigation';

export const workActions = [
    workCreateAction,
    workGetAction,
    workListAction,
    workUpdateGoalAction,
    workUpdateConclusionAction,
    workUpdateStatusAction,
    workCreateInvestigationAction,
    workEnsureInvestigationWorkspaceAction,
    workCreateInvestigationFindingAction,
    workUpdateInvestigationFindingAction,
    workDeleteInvestigationFindingAction,
    workRunInvestigationSqlAction,
    workGetRunEventResultAction,
    workUpdateInvestigationAction,
];
