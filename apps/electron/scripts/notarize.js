import { notarize } from 'electron-notarize';
import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

dotenvConfig({ path: resolve(process.cwd(), '..', '.env.apple') });

export default async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;
    if (electronPlatformName !== 'darwin') {
        return;
    }
    console.log('🚀 Start Apple notarization...');
    const appName = context.packager.appInfo.productFilename;
    console.log(`appName: ${appName}`);
    try {
        await notarize({
            appPath: `${appOutDir}/${appName}.app`,
            appBundleId: 'com.dory.app',
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_ID_PASSWORD,
            tool: 'notarytool',
            teamId: process.env.APPLE_TEAM_ID,
        });
    } catch (error) {
        console.error('❌ Apple notarization Failed:', error);
    }
};
