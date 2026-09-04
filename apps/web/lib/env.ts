/**
 * Parses an environment variable as a boolean flag.
 * Returns `defaultValue` when the variable is undefined; `false` when the value is the string `"false"`.
 */
export function parseEnvFlag(value: string | undefined, defaultValue = true): boolean {
    if (value === undefined) return defaultValue;
    return value !== 'false';
}

/**
 * Enables route prefetching for the small set of workbench destinations that
 * have loading shells. This is public because Link runs in client components.
 */
export const instantNavigationEnabled = parseEnvFlag(process.env.NEXT_PUBLIC_DORY_INSTANT_NAVIGATION, false);
