import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const LOCALES = ['en', 'zh', 'ja', 'es'] as const;
const DYNAMIC_KEYS = {
    Formats: ['arrow', 'csv', 'ndjson', 'parquet'],
    Types: ['boolean', 'date', 'datetime', 'float64', 'int64', 'string'],
    Status: ['analyzing', 'canceled', 'commit_unknown', 'completed', 'draft', 'failed', 'queued', 'ready', 'running', 'uploading'],
    CapabilityReasons: ['batch_commits', 'ddl_not_transactional', 'replace_not_atomic', 'target_non_transactional'],
} as const;

test('ImportWizard locale catalogs have matching keys, placeholders, and dynamic enums', async () => {
    const catalogs = Object.fromEntries(
        await Promise.all(
            LOCALES.map(async locale => {
                const file = path.resolve(process.cwd(), `../../packages/i18n/src/locales/${locale}.json`);
                const catalog = JSON.parse(await readFile(file, 'utf8')) as { ImportWizard: Record<string, unknown> };
                return [locale, catalog.ImportWizard] as const;
            }),
        ),
    );
    const flattened = Object.fromEntries(LOCALES.map(locale => [locale, flatten(catalogs[locale])])) as Record<(typeof LOCALES)[number], Record<string, unknown>>;
    const englishKeys = Object.keys(flattened.en).sort();

    for (const locale of LOCALES) {
        assert.deepEqual(Object.keys(flattened[locale]).sort(), englishKeys, `${locale} ImportWizard keys differ from English`);
        for (const key of englishKeys) {
            assert.deepEqual(placeholders(flattened[locale][key]), placeholders(flattened.en[key]), `${locale} placeholders differ for ${key}`);
        }
    }

    for (const [group, expected] of Object.entries(DYNAMIC_KEYS)) {
        const values = group === 'CapabilityReasons' ? (catalogs.en.Options as Record<string, unknown>)[group] : catalogs.en[group];
        assert.deepEqual(Object.keys(values as Record<string, unknown>).sort(), [...expected], `${group} does not cover its runtime enum`);
    }
});

function flatten(value: Record<string, unknown>, prefix = '', result: Record<string, unknown> = {}) {
    for (const [key, entry] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) flatten(entry as Record<string, unknown>, path, result);
        else result[path] = entry;
    }
    return result;
}

function placeholders(value: unknown) {
    return [...String(value).matchAll(/\{\s*([\w]+)(?:\s*,[^}]*)?\}/g)].map(match => match[1]).sort();
}
