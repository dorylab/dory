import type { DatasetProfileV1, ImportColumnMappingV1, TargetSchema } from './types';

export function createDefaultMappings(profile: DatasetProfileV1, target?: TargetSchema): ImportColumnMappingV1[] {
    const exact = new Map(target?.columns.map(column => [column.name, column]) ?? []);
    const insensitive = new Map<string, Array<NonNullable<typeof target>['columns'][number]>>();
    for (const column of target?.columns ?? []) {
        const key = column.name.toLocaleLowerCase();
        insensitive.set(key, [...(insensitive.get(key) ?? []), column]);
    }

    return profile.columns.map((source, order) => {
        const exactTarget = exact.get(source.name);
        const candidates = insensitive.get(source.name.toLocaleLowerCase()) ?? [];
        const matched = exactTarget ?? (candidates.length === 1 ? candidates[0] : undefined);
        return {
            source: source.name,
            target: matched?.name ?? source.name,
            targetType: matched?.importType ?? source.detectedType,
            ignored: Boolean(target && !matched),
            order,
        };
    });
}

export function validateTargetCoverage(schema: TargetSchema, mappings: ImportColumnMappingV1[]): string[] {
    const mapped = new Set(mappings.filter(column => !column.ignored).map(column => column.target));
    return schema.columns.filter(column => !column.nullable && !column.hasDefault && !mapped.has(column.name)).map(column => column.name);
}
