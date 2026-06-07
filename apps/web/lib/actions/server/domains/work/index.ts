import { workCreateAction } from './create';
import { workGetAction } from './get';
import { workListAction } from './list';
import { workUpdateConclusionAction } from './update-conclusion';
import { workUpdateGoalAction } from './update-goal';
import { workUpdateStatusAction } from './update-status';
import { workCreateInvestigationAction } from './create-investigation';
import { workGetRunEventResultAction } from './get-run-event-result';
import { workRunInvestigationSqlAction } from './run-investigation-sql';
import { workUpdateInvestigationAction } from './update-investigation';
import { workUpdateInvestigationSummaryAction } from './update-investigation-summary';

export const workActions = [
    workCreateAction,
    workGetAction,
    workListAction,
    workUpdateGoalAction,
    workUpdateConclusionAction,
    workUpdateStatusAction,
    workCreateInvestigationAction,
    workRunInvestigationSqlAction,
    workGetRunEventResultAction,
    workUpdateInvestigationAction,
    workUpdateInvestigationSummaryAction,
];
