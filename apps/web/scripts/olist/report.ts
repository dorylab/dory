import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { olistScenarios } from '@/lib/demo/olist-evaluation';

export async function updateOlistReport(directory: string) {
    const read = async (file: string): Promise<Record<string, unknown> | null> => {
        try {
            return JSON.parse(await readFile(path.join(directory, file), 'utf8')) as Record<string, unknown>;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
        }
    };
    const [data, mcp, agent, ui, manifest] = await Promise.all(['data-manifest.json', 'mcp-results.json', 'agent-results.json', 'ui-results.json', 'manifest.json'].map(read));
    const ids = (result: Record<string, unknown> | null) => (Array.isArray(result?.results) ? result.results.map(r => r as Record<string, unknown>) : []);
    const suitePassed = (result: Record<string, unknown> | null, mode: string) => {
        if (!result || result.ok !== true || result.asOf !== data?.asOf || result.connectionId !== manifest?.connectionId || result.modelRevision !== manifest?.modelRevision)
            return false;
        const wanted = olistScenarios(String(data?.asOf))
            .filter(s => mode !== 'mcp' || !s.unavailable)
            .map(s => s.id)
            .sort();
        return (
            JSON.stringify(
                ids(result)
                    .map(r => r.scenarioId)
                    .sort(),
            ) === JSON.stringify(wanted)
        );
    };
    const expectedRuns = [...ids(mcp), ...ids(agent)].map(r => r.workId).sort();
    const checkedRuns = Array.isArray(ui?.checks) ? ui.checks.map(c => (c as Record<string, unknown>).workId).sort() : [];
    const uiPassed = ui?.ok === true && expectedRuns.length === 13 && JSON.stringify(expectedRuns) === JSON.stringify(checkedRuns);
    const stages = [
        { layer: 'data', status: data?.benchmarkEligible === true ? 'passed' : data ? 'failed' : 'not-run' },
        { layer: 'mcp', status: !mcp ? 'not-run' : suitePassed(mcp, 'mcp') ? 'passed' : 'failed' },
        { layer: 'agent', status: !agent ? 'not-run' : suitePassed(agent, 'agent') ? 'passed' : 'failed' },
        { layer: 'run-ui', status: !ui ? 'not-run' : uiPassed ? 'passed' : 'failed' },
    ];
    const report = { recordedAt: new Date().toISOString(), ok: stages.every(s => s.status === 'passed'), runtime: 'web', desktopStatus: 'not-run', stages, data, mcp, agent, ui };
    await writeFile(path.join(directory, 'acceptance-results.json'), JSON.stringify(report, null, 2) + '\n');
    await writeFile(
        path.join(directory, 'acceptance-report.md'),
        [
            '# Olist Knowledge → MCP → Agent Runs acceptance',
            '',
            `Overall: ${report.ok ? 'passed' : 'incomplete or failed'}. Desktop smoke: not run.`,
            '',
            '| Layer | Status |',
            '| --- | --- |',
            ...stages.map(s => `| ${s.layer} | ${s.status} |`),
            '',
            'See data-manifest.json for source hashes and quality; mcp-results.json and agent-results.json for questions, SQL, expected/actual results, model revisions and evidence IDs; ui-results.json for page checks.',
        ].join('\n') + '\n',
    );
    return report;
}
