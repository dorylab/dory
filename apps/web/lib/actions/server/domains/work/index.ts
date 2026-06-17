import { workCreateAction } from './create';
import { workCreateInvestigationFindingAction } from './create-investigation-finding';
import { workDeleteAction } from './delete';
import { workGetAction } from './get';
import { workEnsureInvestigationWorkspaceAction } from './ensure-investigation-workspace';
import { workListAction } from './list';
import { workDeleteInvestigationAction } from './delete-investigation';
import { workDeleteInvestigationFindingAction } from './delete-investigation-finding';
import { workUpdateConclusionAction } from './update-conclusion';
import { workUpdateGoalAction } from './update-goal';
import { workUpdateStatusAction } from './update-status';
import { workUpdateTitleAction } from './update-title';
import { workUpdateAction } from './update';
import { workCreateInvestigationAction } from './create-investigation';
import { workGetRunEventResultAction } from './get-run-event-result';
import { workRunInvestigationSqlAction } from './run-investigation-sql';
import { workSuggestGoalsAction } from './suggest-goals';
import { workUpdateInvestigationFindingAction } from './update-investigation-finding';
import { workUpdateInvestigationAction } from './update-investigation';
import { workReviseInvestigationAction } from './revise-investigation';
import { workWorkspaceActions } from './workspace-actions';

export const workActions = [
    workCreateAction,
    workGetAction,
    workListAction,
    workUpdateAction,
    workUpdateTitleAction,
    workUpdateGoalAction,
    workUpdateConclusionAction,
    workUpdateStatusAction,
    workDeleteAction,
    workCreateInvestigationAction,
    workEnsureInvestigationWorkspaceAction,
    workSuggestGoalsAction,
    workDeleteInvestigationAction,
    workCreateInvestigationFindingAction,
    workUpdateInvestigationFindingAction,
    workDeleteInvestigationFindingAction,
    workRunInvestigationSqlAction,
    workGetRunEventResultAction,
    workUpdateInvestigationAction,
    workReviseInvestigationAction,
    ...workWorkspaceActions,
];
