import { comparisonRunAiReviewAction } from './ai-review';
import { comparisonCreateAction } from './create';
import { comparisonDeleteAction } from './delete';
import { comparisonGetAction } from './get';
import { comparisonListAction } from './list';
import { comparisonRunCreateAction } from './run-create';
import { comparisonRunGetAction } from './run-get';
import { comparisonRunListAction } from './run-list';
import { comparisonUpdateAction } from './update';

export const comparisonActions = [
    comparisonCreateAction,
    comparisonUpdateAction,
    comparisonListAction,
    comparisonGetAction,
    comparisonRunCreateAction,
    comparisonRunListAction,
    comparisonRunGetAction,
    comparisonRunAiReviewAction,
    comparisonDeleteAction,
];
