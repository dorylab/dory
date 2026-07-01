export type DoryDistribution = 'stable' | 'beta';

export interface DistributionPackageMetadata {
    name?: unknown;
    productName?: unknown;
    doryDistribution?: unknown;
    doryElectronAppId?: unknown;
    doryProtocolScheme?: unknown;
}

export interface ResolveDistributionInput {
    env?: NodeJS.ProcessEnv;
    packageMetadata?: DistributionPackageMetadata | null;
    appName?: string | null;
}

function readEnv(env: NodeJS.ProcessEnv | undefined, name: keyof NodeJS.ProcessEnv): string | null {
    const value = env?.[name];
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    return trimmed || null;
}

function readString(value: unknown): string | null {
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    return trimmed || null;
}

function isBetaLikeName(value: string | null | undefined): boolean {
    return /\bbeta\b/i.test(value ?? '');
}

export function resolveDistribution({ env = process.env, packageMetadata, appName }: ResolveDistributionInput): DoryDistribution {
    const envDistribution = readEnv(env, 'DORY_DISTRIBUTION');
    if (envDistribution === 'beta') return 'beta';
    if (envDistribution) return 'stable';

    const metadataDistribution = readString(packageMetadata?.doryDistribution);
    if (metadataDistribution === 'beta') return 'beta';
    if (metadataDistribution) return 'stable';

    if (isBetaLikeName(readString(packageMetadata?.productName))) return 'beta';
    if (isBetaLikeName(appName)) return 'beta';

    return 'stable';
}

export function resolveElectronAppId({ env = process.env, packageMetadata, distribution }: ResolveDistributionInput & { distribution: DoryDistribution }): string {
    return (
        readEnv(env, 'DORY_ELECTRON_APP_ID') ??
        readString(packageMetadata?.doryElectronAppId) ??
        (distribution === 'beta' ? 'com.dory.app.beta' : 'com.dory.app')
    );
}

export function resolveProtocolScheme({ env = process.env, packageMetadata, distribution }: ResolveDistributionInput & { distribution: DoryDistribution }): string {
    return (
        readEnv(env, 'DORY_PROTOCOL_SCHEME') ??
        readString(packageMetadata?.doryProtocolScheme) ??
        (distribution === 'beta' ? 'dory-beta' : 'dory')
    );
}
