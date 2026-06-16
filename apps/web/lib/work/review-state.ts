export type WorkReviewAuditStatus = 'draft' | 'reviewed' | 'revised' | 'accepted' | 'rejected';
export type WorkLifecycleStatus = 'draft' | 'running' | 'completed';
export type WorkReviewRunStatus = 'running' | 'completed' | 'failed';
export type WorkLifecycleDisplayStatus = 'draft' | 'running' | 'in_progress' | 'needs_attention' | 'ready' | 'failed';
export type WorkConclusionStatus = 'fresh' | 'outdated' | 'missing';
export type WorkConclusionConfidence = 'low' | 'medium' | 'high';
export type WorkConclusionMetadata = {
    confidence: WorkConclusionConfidence;
    caveats: string[];
    recommendedNextStep: string | null;
} | null;

export type WorkReviewFinding = {
    content: string;
    createdBy?: 'user' | 'agent' | 'automation' | string;
};

export type WorkReviewAnalysis = {
    id: string;
    title: string;
    auditStatus: WorkReviewAuditStatus;
    findings?: WorkReviewFinding[];
};

export type WorkReviewRun = {
    status: WorkReviewRunStatus;
} | null;

export const WORK_REVIEW_AUDIT_STATUS_ORDER: WorkReviewAuditStatus[] = ['accepted', 'rejected', 'reviewed', 'revised', 'draft'];

function normalizedTitle(analysis: Pick<WorkReviewAnalysis, 'title'>) {
    return analysis.title.trim() || 'Analysis';
}

function formatAuditStatus(status: WorkReviewAuditStatus) {
    return status.replace(/_/g, ' ');
}

export function getWorkReviewCounts(analyses: WorkReviewAnalysis[]) {
    const counts = Object.fromEntries(WORK_REVIEW_AUDIT_STATUS_ORDER.map(status => [status, 0])) as Record<WorkReviewAuditStatus, number>;
    for (const analysis of analyses) {
        counts[analysis.auditStatus] += 1;
    }
    return counts;
}

export function formatWorkReviewCounts(analyses: WorkReviewAnalysis[]) {
    const counts = getWorkReviewCounts(analyses);
    const parts = WORK_REVIEW_AUDIT_STATUS_ORDER.flatMap(status => {
        const count = counts[status];
        return count > 0 ? [`${count} ${formatAuditStatus(status)}`] : [];
    });
    return parts.length ? parts.join(' · ') : 'No analyses yet';
}

export function getWorkEvidenceCounts(analyses: WorkReviewAnalysis[]) {
    let included = 0;
    let excluded = 0;
    let agentGenerated = 0;
    let humanConfirmed = 0;
    let humanEdited = 0;

    for (const analysis of analyses) {
        if (analysis.auditStatus === 'rejected') {
            excluded += 1;
            continue;
        }

        included += 1;
        if (analysis.auditStatus === 'accepted' || analysis.auditStatus === 'reviewed') {
            humanConfirmed += 1;
        } else if (analysis.auditStatus === 'revised') {
            humanEdited += 1;
        } else if (analysis.auditStatus === 'draft') {
            agentGenerated += 1;
        }
    }

    return { included, excluded, agentGenerated, humanConfirmed, humanEdited, unconfirmed: included - humanConfirmed };
}

export function formatWorkEvidenceSummary(analyses: WorkReviewAnalysis[]) {
    const counts = getWorkEvidenceCounts(analyses);
    if (analyses.length === 0) return 'No evidence yet';
    return `${counts.included} included · ${counts.excluded} excluded`;
}

export function formatUnconfirmedAnalysisSummary(analyses: WorkReviewAnalysis[]) {
    const counts = getWorkEvidenceCounts(analyses);
    if (counts.unconfirmed === 0) return null;
    return `${counts.unconfirmed} ${counts.unconfirmed === 1 ? 'is' : 'are'} included and not human-confirmed.`;
}

export function getWorkLifecycleDisplayStatus(input: {
    workStatus: WorkLifecycleStatus;
    latestRun: WorkReviewRun;
    analyses?: WorkReviewAnalysis[];
    conclusionStatus?: WorkConclusionStatus;
    conclusionMetadata?: WorkConclusionMetadata;
}): WorkLifecycleDisplayStatus {
    if (input.latestRun?.status === 'running' || input.workStatus === 'running') return 'running';
    if (input.latestRun?.status === 'failed') return 'failed';
    if (input.workStatus === 'draft' && !input.latestRun) return 'ready';

    const analyses = input.analyses ?? [];
    const counts = getWorkEvidenceCounts(analyses);
    if (analyses.length === 0 || counts.included === 0) return input.workStatus === 'draft' ? 'draft' : 'in_progress';

    if (input.conclusionStatus !== 'fresh') return 'needs_attention';
    if (!input.conclusionMetadata) return 'needs_attention';
    return 'ready';
}

export function analysisEvidenceLabel(analysis: Pick<WorkReviewAnalysis, 'auditStatus'>) {
    if (analysis.auditStatus === 'rejected') return 'Excluded';
    if (analysis.auditStatus === 'accepted' || analysis.auditStatus === 'reviewed') return 'Verified · Used in conclusion';
    if (analysis.auditStatus === 'revised') return 'Included · Human edited';
    return 'Included · Agent output';
}

export function fallbackConclusionMetadata(input: { analyses: WorkReviewAnalysis[]; conclusionStatus?: WorkConclusionStatus }): NonNullable<WorkConclusionMetadata> {
    const counts = getWorkEvidenceCounts(input.analyses);
    const caveats: string[] = [];
    if (counts.unconfirmed > 0) {
        caveats.push(`${counts.unconfirmed} included ${counts.unconfirmed === 1 ? 'analysis is' : 'analyses are'} not human-confirmed.`);
    }
    if (input.conclusionStatus !== 'fresh') {
        caveats.push('The conclusion is missing or may be outdated after Analysis changes.');
    }
    if (counts.excluded > 0) {
        caveats.push(`${counts.excluded} ${counts.excluded === 1 ? 'analysis is' : 'analyses are'} excluded from the conclusion.`);
    }

    return {
        confidence: counts.included > 0 && counts.unconfirmed === 0 && input.conclusionStatus === 'fresh' ? 'high' : counts.included > 0 ? 'medium' : 'low',
        caveats,
        recommendedNextStep:
            counts.unconfirmed > 0
                ? 'Review and verify the included analyses before trusting the conclusion.'
                : input.conclusionStatus !== 'fresh'
                  ? 'Update the conclusion from the current included analyses.'
                  : null,
    };
}

export function isIncludedAnalysis(analysis: Pick<WorkReviewAnalysis, 'auditStatus'>) {
    return analysis.auditStatus !== 'rejected';
}

export function getIncludedAnalyses<T extends Pick<WorkReviewAnalysis, 'auditStatus'>>(analyses: T[]) {
    return analyses.filter(isIncludedAnalysis);
}

export function getExcludedAnalyses<T extends Pick<WorkReviewAnalysis, 'auditStatus'>>(analyses: T[]) {
    return analyses.filter(analysis => !isIncludedAnalysis(analysis));
}

export function analysisProvenanceLabel(analysis: Pick<WorkReviewAnalysis, 'auditStatus'> & { findings?: WorkReviewFinding[] }) {
    if (analysis.auditStatus === 'accepted' || analysis.auditStatus === 'reviewed') return 'Human confirmed';
    if (analysis.auditStatus === 'revised') return 'Human edited';
    if (analysis.findings?.some(finding => finding.createdBy === 'user')) return 'Human edited';
    return 'Agent output';
}

export function buildIncludedAnalysisConclusion(analyses: WorkReviewAnalysis[]) {
    return buildIncludedAnalysisConclusionFromFindings(
        analyses,
        analyses.flatMap(analysis => (analysis.findings ?? []).map(finding => ({ investigationId: analysis.id, content: finding.content }))),
    );
}

export function buildIncludedAnalysisConclusionFromFindings(
    analyses: Array<Pick<WorkReviewAnalysis, 'id' | 'title' | 'auditStatus'>>,
    findings: Array<{
        investigationId: string;
        content: string;
    }>,
) {
    const includedAnalyses = getIncludedAnalyses(analyses);
    if (includedAnalyses.length === 0) return null;
    const findingsByAnalysisId = new Map<string, string[]>();
    for (const finding of findings) {
        const content = finding.content.trim();
        if (!content) continue;
        const existing = findingsByAnalysisId.get(finding.investigationId) ?? [];
        existing.push(content);
        findingsByAnalysisId.set(finding.investigationId, existing);
    }

    return [
        'Based on included analysis findings:',
        '',
        ...includedAnalyses.flatMap(analysis => {
            const findings = findingsByAnalysisId.get(analysis.id) ?? [];
            return [`- ${normalizedTitle(analysis)}`, ...(findings.length ? findings.map(finding => `  - ${finding}`) : ['  - No findings recorded.'])];
        }),
    ].join('\n');
}

export const buildAcceptedOnlyConclusion = buildIncludedAnalysisConclusion;
export const buildAcceptedOnlyConclusionFromFindings = buildIncludedAnalysisConclusionFromFindings;

export function getConclusionSourceBoundary(analyses: WorkReviewAnalysis[]) {
    return {
        includedAnalyses: getIncludedAnalyses(analyses).map(analysis => ({
            id: analysis.id,
            title: normalizedTitle(analysis),
            auditStatus: analysis.auditStatus,
            provenanceLabel: analysisProvenanceLabel(analysis),
        })),
        excludedAnalyses: getExcludedAnalyses(analyses).map(analysis => ({
            id: analysis.id,
            title: normalizedTitle(analysis),
            auditStatus: analysis.auditStatus,
            provenanceLabel: analysisProvenanceLabel(analysis),
        })),
    };
}
