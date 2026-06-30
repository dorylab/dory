export type ParsedDoryDeepLink =
  | {
      type: 'open';
      path: string;
    }
  | {
      type: 'auth';
      url: string;
    };

function isSafeWorkspacePath(value: string | null): value is string {
  if (!value) return false;
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (value.includes('\\')) return false;
  return !/[\u0000-\u001f\u007f]/.test(value);
}

export function parseDoryDeepLink(url: string, protocol: string): ParsedDoryDeepLink | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== `${protocol}:`) {
    return null;
  }

  if (parsed.hostname !== 'open') {
    return { type: 'auth', url };
  }

  const path = parsed.searchParams.get('path');
  if (!isSafeWorkspacePath(path)) {
    return null;
  }

  return {
    type: 'open',
    path,
  };
}
