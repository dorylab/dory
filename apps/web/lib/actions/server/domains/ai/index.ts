import { aiSchemaTagsAction } from './schema-tags';
import { aiSchemaExplanationsAction } from './schema-explanations';
import { aiTableSummaryAction } from './table-summary';
import { aiTableStatsInsightsAction } from './table-stats-insights';
import { aiTabTitleAction } from './tab-title';
import { aiSavedQueryMetadataAction } from './saved-query-metadata';
import { aiResultInsightsAction } from './result-insights';
import { aiQuickActions } from './quick-actions';

export const aiActions = [
    aiSchemaTagsAction,
    aiSchemaExplanationsAction,
    aiTableSummaryAction,
    aiTableStatsInsightsAction,
    aiTabTitleAction,
    aiSavedQueryMetadataAction,
    aiResultInsightsAction,
    ...aiQuickActions,
];
