import { comparisonAiReviewAction } from './ai-review';
import { comparisonSchemaCreateAction } from './create';
import { comparisonDeleteAction } from './delete';
import { comparisonGetAction } from './get';
import { comparisonListAction } from './list';

export const comparisonActions = [comparisonSchemaCreateAction, comparisonListAction, comparisonGetAction, comparisonAiReviewAction, comparisonDeleteAction];
