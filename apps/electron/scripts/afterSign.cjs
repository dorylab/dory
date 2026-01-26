module.exports = async function (context) {
    const { pathToFileURL } = require('node:url');
    const { spawnSync } = require('node:child_process');
    const path = require('node:path');

    const script = path.join(process.cwd(), 'scripts', 'notarize.js');

    const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsx', script], {
        stdio: 'inherit',
        env: {
            ...process.env,
            EB_ELECTRON_PLATFORM: context.electronPlatformName,
            EB_APP_OUT_DIR: context.appOutDir,
            EB_PRODUCT_FILENAME: context.packager.appInfo.productFilename,
        },
    });

    if (r.status !== 0) throw new Error(`notarize.js failed with code ${r.status}`);
};
