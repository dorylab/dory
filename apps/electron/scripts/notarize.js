import { notarizeTarget, shouldSkipNotarize } from './notarize-utils.js';

export default async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;
    if (electronPlatformName !== 'darwin') {
        return;
    }
    if (shouldSkipNotarize()) {
        console.log('⏭️ SKIP_NOTARIZE=1, skipping Apple notarization.');
        return;
    }
    console.log('🚀 Start Apple notarization...');
    const appName = context.packager.appInfo.productFilename;
    console.log(`appName: ${appName}`);
    const appPath = `${appOutDir}/${appName}.app`;

    await notarizeTarget(appPath);
};
