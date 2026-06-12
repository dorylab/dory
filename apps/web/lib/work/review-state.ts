export type WorkReviewAuditStatus = 'draft' | 'needs_review' | 'reviewed' | 'revised' | 'accepted' | 'rejected';
export type WorkLifecycleStatus = 'draft' | 'running' | 'completed';
export type WorkReviewRunStatus = 'running' | 'completed' | 'failed';
export type WorkLifecycleDisplayStatus = 'draft' | 'running' | 'completed' | 'failed';

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

export const WORK_REVIEW_AUDIT_STATUS_ORDER: WorkReviewAuditStatus[] = ['accepted', 'rejected', 'needs_review', 'reviewed', 'revised', 'draft'];

function normalizedTitle(analysis: Pick<WorkReviewAnalysis, 'title'>) {
    return analysis.title.trim() || 'Analysis';
}

function formatAuditStatus(status: WorkReviewAuditStatus) {
    if (status === 'needs_review') return 'agent output';
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
    let needsReview = 0;

    for (const analysis of analyses) {
        if (analysis.auditStatus === 'rejected') {
            excluded += 1;
            continue;
        }

        included += 1;
        if (analysis.auditStatus === 'accepted' || analysis.auditStatus === 'reviewed') {
            humanConfirmed += 1;
        } else if (analysis.auditStatus === 'needs_review') {
            needsReview += 1;
        } else if (analysis.auditStatus === 'draft') {
            agentGenerated += 1;
        }
    }

    return { included, excluded, agentGenerated, humanConfirmed, needsReview };
}

export function formatWorkEvidenceSummary(analyses: WorkReviewAnalysis[]) {
    const counts = getWorkEvidenceCounts(analyses);
    if (analyses.length === 0) return 'No evidence yet';
    return `${counts.included} included · ${counts.excluded} excluded`;
}

export function formatUnconfirmedAnalysisSummary(analyses: WorkReviewAnalysis[]) {
    const counts = getWorkEvidenceCounts(analyses);
    if (counts.agentGenerated === 0) return null;
    return `${counts.agentGenerated} ${counts.agentGenerated === 1 ? 'is' : 'are'} Agent-generated and not confirmed.`;
}

export function getWorkLifecycleDisplayStatus(input: { workStatus: WorkLifecycleStatus; latestRun: WorkReviewRun }): WorkLifecycleDisplayStatus {
    if (input.latestRun?.status === 'running' || input.workStatus === 'running') return 'running';
    if (input.latestRun?.status === 'failed') return 'failed';
    return input.workStatus;
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
    if (analysis.auditStatus === 'needs_review') return 'Needs review';
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
