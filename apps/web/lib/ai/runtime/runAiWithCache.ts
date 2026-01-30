import type { AiSchemaCacheRepository } from '@/lib/database/postgres/impl/ai-schema-cache';
import { getDBService } from '@/lib/database';

export type RunAiWithCacheOptions<TNormalized, TPayload> = {
    teamId: string;
    connectionId: string;
    feature: string;
    model: string;
    inputHash: string;

    catalog?: string | null;
    dbType?: string | null;
    databaseName?: string | null;
    tableName?: string | null;

    promptVersion?: number;
    algoVersion?: number;
    ignoreCache?: boolean;

    normalize: (payload: TPayload | null) => TNormalized;
    run: () => Promise<{ payload: TPayload | null }>;
};

export type RunAiWithCacheResult<TNormalized, TPayload> = {
    normalized: TNormalized;
    payload: TPayload | null;
    fromCache: boolean;
};

export async function runAiWithCache<TNormalized, TPayload>(
    options: RunAiWithCacheOptions<TNormalized, TPayload>,
): Promise<RunAiWithCacheResult<TNormalized, TPayload>> {
    const {
        teamId,
        connectionId,
        feature,
        model,
        inputHash,
        catalog,
        dbType,
        databaseName,
        tableName,
        promptVersion = 1,
        algoVersion,
        ignoreCache = false,
        normalize,
        run,
    } = options;

    console.log(`[runAiWithCache] feature=${feature}, model=${model}, inputHash=${inputHash}, ignoreCache=${ignoreCache}`);

    const effectiveCatalog = catalog ?? 'default';
    const featureKey = typeof algoVersion === 'number' ? `${feature}:algo${algoVersion}` : feature;

    const dbService = await getDBService();
    const aiSchemaCacheRepo = (dbService as any).aiSchemaCache as AiSchemaCacheRepository;

    const cacheKey = {
        teamId,
        connectionId,
        catalog: effectiveCatalog,
        feature: featureKey,
        schemaHash: inputHash,
        model,
        promptVersion,
    };

    let cached = null;
    if (!ignoreCache) {
        cached = await aiSchemaCacheRepo.find(cacheKey);
    }

    if (cached?.payload) {
        const payload = cached.payload as TPayload;
        const normalized = normalize(payload);
        return { normalized, payload, fromCache: true };
    }

    const { payload } = await run();
    const normalized = normalize(payload);

    try {
        await aiSchemaCacheRepo.upsert({
            ...cacheKey,
            dbType: dbType ?? null,
            databaseName: databaseName ?? null,
            tableName: tableName ?? null,
            payload,
        });
    } catch (error) {
        console.error('[runAiWithCache] cache upsert failed:', error);
    }

    return { normalized, payload, fromCache: false };
}
