import { extname } from 'path';
import { notarizeTarget, shouldSkipNotarize } from './notarize-utils.js';

export default async function notarizeArtifacts(context) {
    const artifactPaths = Array.isArray(context.artifactPaths) ? context.artifactPaths : [];
    const dmgPaths = artifactPaths.filter((artifactPath) => extname(artifactPath) === '.dmg');

    if (dmgPaths.length === 0) {
        return [];
    }

    if (shouldSkipNotarize()) {
        console.log('⏭️ SKIP_NOTARIZE=1, skipping Apple DMG notarization.');
        return [];
    }

    for (const dmgPath of dmgPaths) {
        console.log(`🚀 Start Apple DMG notarization: ${dmgPath}`);
        await notarizeTarget(dmgPath);
    }

    return [];
}
