function readEnv(name) {
    const value = process.env[name];
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    return trimmed || null;
}

const distribution = readEnv('DORY_DISTRIBUTION') === 'beta' ? 'beta' : 'stable';
const updateChannel = process.env.DORY_UPDATE_CHANNEL === 'beta' ? 'beta' : 'latest';
const appId = readEnv('DORY_ELECTRON_APP_ID') ?? (distribution === 'beta' ? 'com.dory.app.beta' : 'com.dory.app');
const productName = distribution === 'beta' ? 'Dory Beta' : 'Dory';
const protocolScheme = readEnv('DORY_PROTOCOL_SCHEME') ?? (distribution === 'beta' ? 'dory-beta' : 'dory');
const buildArch = readEnv('DORY_BUILD_ARCH');
const artifactName = buildArch
    ? `\${productName}-\${version}-${buildArch}.\${ext}`
    : '${productName}-${version}-${arch}.${ext}';
const betaArtifactName = '${productName}-${version}-${os}-${arch}-beta.${ext}';
const windowsInstallerArtifactName =
    distribution === 'beta'
        ? '${productName}-Setup-${version}-${os}-${arch}-beta.${ext}'
        : '${productName}-Setup-${version}.${ext}';
const windowsPortableArtifactName =
    distribution === 'beta'
        ? '${productName}-Portable-${version}-${os}-${arch}-beta.${ext}'
        : '${productName}-Portable-${version}.${ext}';

/** @type {import('electron-builder').Configuration} */
const config = {
    appId,
    productName,
    extraMetadata: {
        main: 'dist-electron/main.js',
    },
    artifactName: distribution === 'beta' ? betaArtifactName : artifactName,
    publish: [
        {
            provider: 'github',
            owner: 'dorylab',
            repo: 'dory',
            releaseType: updateChannel === 'beta' ? 'prerelease' : 'release',
            channel: updateChannel,
        },
    ],
    protocols: [
        {
            name: `${productName} Protocol`,
            schemes: [protocolScheme],
        },
    ],
    files: ['dist-electron/**/*', 'package.json'],
    extraResources: [
        {
            from: '../../release/standalone',
            to: 'standalone',
            filter: ['**/*'],
        },
    ],
    asar: true,
    asarUnpack: ['**/*.node'],
    dmg: {
        title: '${productName} ${version}${arch}',
        backgroundColor: '#ffffff',
        icon: null,
        iconSize: 96,
        iconTextSize: 14,
        window: {
            width: 540,
            height: 380,
        },
        contents: [
            {
                x: 145,
                y: 205,
                type: 'file',
            },
            {
                x: 395,
                y: 205,
                type: 'link',
                path: '/Applications',
            },
        ],
        writeUpdateInfo: false,
    },
    afterSign: './scripts/notarize.js',
    afterAllArtifactBuild: './scripts/notarize-artifacts.js',
    mac: {
        icon: '../web/public/logo.icns',
        category: 'public.app-category.developer-tools',
        notarize: false,
        hardenedRuntime: true,
        gatekeeperAssess: false,
        entitlements: './scripts/entitlements.mac.plist',
        entitlementsInherit: './scripts/entitlements.mac.plist',
        target: ['dmg', 'zip'],
        signIgnore: ['.*\\.map$', '.*\\.ttf$', '.*\\.woff2?$'],
    },
    win: {
        icon: '../../public/app.ico',
        target: ['nsis', 'zip', 'portable'],
    },
    nsis: {
        artifactName: windowsInstallerArtifactName,
        oneClick: false,
        allowElevation: true,
        allowToChangeInstallationDirectory: true,
        installerIcon: '../../public/app.ico',
        installerHeaderIcon: '../../public/app.ico',
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: productName,
    },
    portable: {
        artifactName: windowsPortableArtifactName,
    },
};

export default config;
