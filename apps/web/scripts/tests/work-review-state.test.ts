import assert from 'node:assert/strict';
import test from 'node:test';

import {
    analysisEvidenceLabel,
    buildIncludedAnalysisConclusion,
    formatWorkEvidenceSummary,
    formatUnconfirmedAnalysisSummary,
    getConclusionSourceBoundary,
    getWorkLifecycleDisplayStatus,
    type WorkReviewAnalysis,
} from '@/lib/work/review-state';

const mixedAnalyses: WorkReviewAnalysis[] = [
    {
        id: 'analysis-accepted',
        title: '价格更新趋势分析',
        auditStatus: 'accepted',
        findings: [{ content: 'Confirmed trend finding.', createdBy: 'agent' }],
    },
    {
        id: 'analysis-rejected',
        title: '模型价格对比分析',
        auditStatus: 'rejected',
        findings: [{ content: 'Rejected comparison finding.', createdBy: 'agent' }],
    },
    {
        id: 'analysis-draft',
        title: '价格分布分析',
        auditStatus: 'draft',
        findings: [{ content: 'Draft distribution finding.', createdBy: 'agent' }],
    },
    {
        id: 'analysis-needs-review',
        title: '价格风险分析',
        auditStatus: 'needs_review',
        findings: [{ content: 'Legacy needs-review finding.', createdBy: 'agent' }],
    },
    {
        id: 'analysis-revised',
        title: '价格异常分析',
        auditStatus: 'revised',
        findings: [{ content: 'Human edited anomaly finding.', createdBy: 'user' }],
    },
];

test('included-analysis conclusion includes non-rejected findings', () => {
    const conclusion = buildIncludedAnalysisConclusion(mixedAnalyses);

    assert.ok(conclusion);
    assert.match(conclusion, /价格更新趋势分析/);
    assert.match(conclusion, /Confirmed trend finding/);
    assert.match(conclusion, /价格分布分析/);
    assert.match(conclusion, /Draft distribution finding/);
    assert.match(conclusion, /价格风险分析/);
    assert.match(conclusion, /Legacy needs-review finding/);
    assert.match(conclusion, /价格异常分析/);
    assert.match(conclusion, /Human edited anomaly finding/);
    assert.doesNotMatch(conclusion, /模型价格对比分析/);
    assert.doesNotMatch(conclusion, /Rejected comparison finding/);
});

test('source boundary lists included and excluded analyses separately', () => {
    assert.deepEqual(getConclusionSourceBoundary(mixedAnalyses), {
        includedAnalyses: [
            {
                id: 'analysis-accepted',
                title: '价格更新趋势分析',
                auditStatus: 'accepted',
                provenanceLabel: 'Human confirmed',
            },
            {
                id: 'analysis-draft',
                title: '价格分布分析',
                auditStatus: 'draft',
                provenanceLabel: 'Agent output',
            },
            {
                id: 'analysis-needs-review',
                title: '价格风险分析',
                auditStatus: 'needs_review',
                provenanceLabel: 'Needs review',
            },
            {
                id: 'analysis-revised',
                title: '价格异常分析',
                auditStatus: 'revised',
                provenanceLabel: 'Human edited',
            },
        ],
        excludedAnalyses: [
            {
                id: 'analysis-rejected',
                title: '模型价格对比分析',
                auditStatus: 'rejected',
                provenanceLabel: 'Agent output',
            },
        ],
    });
});

test('draft analysis is included by default', () => {
    const conclusion = buildIncludedAnalysisConclusion([
        {
            id: 'analysis-draft',
            title: 'Draft Analysis',
            auditStatus: 'draft',
            findings: [{ content: 'Draft finding.' }],
        },
    ]);

    assert.ok(conclusion);
    assert.match(conclusion, /Draft Analysis/);
    assert.match(conclusion, /Draft finding/);
});

test('all excluded analyses return no included-analysis conclusion', () => {
    assert.equal(
        buildIncludedAnalysisConclusion([
            {
                id: 'analysis-rejected',
                title: 'Rejected Analysis',
                auditStatus: 'rejected',
                findings: [{ content: 'Rejected finding.' }],
            },
        ]),
        null,
    );
});

test('work evidence counts are formatted for Evidence and Analyses summaries', () => {
    assert.equal(formatWorkEvidenceSummary(mixedAnalyses), '4 included · 1 excluded');
    assert.equal(formatUnconfirmedAnalysisSummary(mixedAnalyses), '3 are included and not human-confirmed.');
});

test('completed Work display status needs review when evidence includes unconfirmed analysis', () => {
    assert.equal(
        getWorkLifecycleDisplayStatus({
            workStatus: 'completed',
            latestRun: { status: 'completed' },
            analyses: mixedAnalyses,
            conclusionStatus: 'fresh',
            conclusionMetadata: {
                confidence: 'medium',
                caveats: [],
                recommendedNextStep: null,
            },
        }),
        'needs_review',
    );
});

test('completed Work display status is ready when included evidence and conclusion metadata are verified', () => {
    assert.equal(
        getWorkLifecycleDisplayStatus({
            workStatus: 'completed',
            latestRun: { status: 'completed' },
            analyses: [
                {
                    id: 'analysis-accepted',
                    title: 'Verified Analysis',
                    auditStatus: 'accepted',
                    findings: [{ content: 'Confirmed finding.', createdBy: 'agent' }],
                },
            ],
            conclusionStatus: 'fresh',
            conclusionMetadata: {
                confidence: 'high',
                caveats: [],
                recommendedNextStep: null,
            },
        }),
        'ready',
    );
});

test('fresh conclusion without metadata still needs review', () => {
    assert.equal(
        getWorkLifecycleDisplayStatus({
            workStatus: 'completed',
            latestRun: { status: 'completed' },
            analyses: [
                {
                    id: 'analysis-reviewed',
                    title: 'Reviewed Analysis',
                    auditStatus: 'reviewed',
                    findings: [{ content: 'Reviewed finding.', createdBy: 'agent' }],
                },
            ],
            conclusionStatus: 'fresh',
            conclusionMetadata: null,
        }),
        'needs_review',
    );
});

test('draft Work lifecycle stays draft before a run', () => {
    assert.equal(
        getWorkLifecycleDisplayStatus({
            workStatus: 'draft',
            latestRun: null,
        }),
        'draft',
    );
});

test('latest failed and running runs override analysis review status', () => {
    assert.equal(
        getWorkLifecycleDisplayStatus({
            workStatus: 'completed',
            latestRun: { status: 'failed' },
        }),
        'failed',
    );
    assert.equal(
        getWorkLifecycleDisplayStatus({
            workStatus: 'completed',
            latestRun: { status: 'running' },
        }),
        'running',
    );
});

test('analysis evidence labels separate included drafts from verified evidence', () => {
    assert.equal(analysisEvidenceLabel({ auditStatus: 'rejected' }), 'Excluded');
    assert.equal(analysisEvidenceLabel({ auditStatus: 'accepted' }), 'Verified · Used in conclusion');
    assert.equal(analysisEvidenceLabel({ auditStatus: 'reviewed' }), 'Verified · Used in conclusion');
    assert.equal(analysisEvidenceLabel({ auditStatus: 'draft' }), 'Needs review · Included by Agent');
    assert.equal(analysisEvidenceLabel({ auditStatus: 'needs_review' }), 'Needs review · Included by Agent');
    assert.equal(analysisEvidenceLabel({ auditStatus: 'revised' }), 'Needs review · Human edited');
});
