import type { DBService } from '@dory/database';

export async function completeAgentWorkTitle(
    repository: Pick<DBService['chat'], 'claimWorkTitle' | 'finishWorkTitle'>,
    owner: { organizationId: string; userId: string; sessionId: string },
    generate: () => Promise<string>,
) {
    if (!(await repository.claimWorkTitle(owner))) return;
    let title: string | null = null;
    try {
        title =
            (await generate())
                .replace(/^[\s#`"'“”]+|[\s`"'“”]+$/g, '')
                .split('\n')[0]
                .trim()
                .slice(0, 80) || null;
    } catch {
        // Title failure must not fail the work or expose the original prompt as its title.
    }
    await repository.finishWorkTitle(owner, title);
}
