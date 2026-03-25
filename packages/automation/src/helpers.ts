import type { NextRequest, NextResponse } from 'next/server';
import { NextResponse as NextResponseCtor } from 'next/server';
import type {
    AutomationErrorCode,
    AutomationErrorPayload,
    AutomationErrorResponse,
    AutomationRuntimeAdapters,
    AutomationSessionContext,
    AutomationValueResult,
} from './types';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1']);

function normalizeNetworkValue(value: string): string {
    let normalized = value.trim();

    if (!normalized) {
        return normalized;
    }

    normalized = normalized.replace(/^for=/i, '').trim();
    normalized = normalized.replace(/^"(.*)"$/, '$1').trim();

    if (normalized.startsWith('[')) {
        const endIndex = normalized.indexOf(']');
        if (endIndex >= 0) {
            return normalized.slice(1, endIndex).trim().toLowerCase();
        }
    }

    const colonCount = normalized.split(':').length - 1;
    if (colonCount === 1 && normalized.includes(':')) {
        return normalized.slice(0, normalized.lastIndexOf(':')).trim().toLowerCase();
    }

    return normalized.trim().toLowerCase();
}

function isLoopbackValue(value: string | null | undefined): boolean {
    if (!value) {
        return false;
    }

    return LOOPBACK_HOSTS.has(normalizeNetworkValue(value));
}

function extractHostnameFromUrl(value: string | null): string | null {
    if (!value) {
        return null;
    }

    try {
        return new URL(value).hostname;
    } catch {
        return null;
    }
}

function extractFirstHeaderValue(value: string | null): string | null {
    if (!value) {
        return null;
    }

    const first = value
        .split(',')
        .map(entry => entry.trim())
        .find(Boolean);

    return first ?? null;
}

function extractForwardedFor(value: string | null): string | null {
    if (!value) {
        return null;
    }

    const first = extractFirstHeaderValue(value);
    if (!first) {
        return null;
    }

    const match = first.match(/for=(?:"?\[?([^\]";,]+)\]?(?::\d+)?"?)/i);
    return match?.[1] ?? null;
}

export function createError(code: AutomationErrorCode, message: string): AutomationErrorPayload {
    return {
        code,
        message,
    };
}

export function jsonOk<T extends Record<string, unknown>>(payload: T, init?: ResponseInit): NextResponse<T & { ok: true }> {
    return NextResponseCtor.json(
        {
            ok: true,
            ...payload,
        },
        init,
    );
}

export function jsonError(code: AutomationErrorCode, message: string, init?: ResponseInit): NextResponse<AutomationErrorResponse> {
    return NextResponseCtor.json(
        {
            ok: false,
            error: createError(code, message),
        },
        init,
    );
}

export function assertLocalhostRequest(req: NextRequest): NextResponse<AutomationErrorResponse> | null {
    const requestHost = extractHostnameFromUrl(req.url);
    if (requestHost && !isLoopbackValue(requestHost)) {
        return jsonError('LOCALHOST_ONLY', 'Automation API is only available from localhost', { status: 403 });
    }

    const hostHeaders = [req.headers.get('host'), req.headers.get('x-forwarded-host')]
        .map(value => extractFirstHeaderValue(value))
        .filter((value): value is string => Boolean(value));

    for (const value of hostHeaders) {
        if (!isLoopbackValue(value)) {
            return jsonError('LOCALHOST_ONLY', 'Automation API is only available from localhost', { status: 403 });
        }
    }

    const urlHeaders = [req.headers.get('origin'), req.headers.get('referer')]
        .map(value => extractHostnameFromUrl(value))
        .filter((value): value is string => Boolean(value));

    for (const hostname of urlHeaders) {
        if (!isLoopbackValue(hostname)) {
            return jsonError('LOCALHOST_ONLY', 'Automation API is only available from localhost', { status: 403 });
        }
    }

    const forwardedFor = extractFirstHeaderValue(req.headers.get('x-forwarded-for'));
    if (forwardedFor && !isLoopbackValue(forwardedFor)) {
        return jsonError('LOCALHOST_ONLY', 'Automation API is only available from localhost', { status: 403 });
    }

    const forwarded = extractForwardedFor(req.headers.get('forwarded'));
    if (forwarded && !isLoopbackValue(forwarded)) {
        return jsonError('LOCALHOST_ONLY', 'Automation API is only available from localhost', { status: 403 });
    }

    return null;
}

export function createAutomationGuards(adapters: Pick<AutomationRuntimeAdapters, 'resolveSession'>) {
    return {
        async requireAutomationSession(req: NextRequest): Promise<AutomationValueResult<AutomationSessionContext>> {
            const localhostError = assertLocalhostRequest(req);
            if (localhostError) {
                return { response: localhostError };
            }

            const resolved = await adapters.resolveSession(req);
            const userId = resolved?.user?.id?.trim();

            if (!userId) {
                return {
                    response: jsonError('NOT_SIGNED_IN', 'Please sign in first', { status: 401 }),
                };
            }

            const organizationId = resolved?.organizationId?.trim();
            if (!organizationId) {
                return {
                    response: jsonError('ORGANIZATION_REQUIRED', 'Active organization is required', { status: 401 }),
                };
            }

            const resolvedSession = resolved as NonNullable<typeof resolved>;

            return {
                value: {
                    session: resolvedSession.session,
                    user: {
                        id: userId,
                        ...(resolvedSession.user?.email ? { email: resolvedSession.user.email } : {}),
                    },
                    organizationId,
                },
            };
        },
    };
}

export async function readJsonBody<T>(req: NextRequest): Promise<AutomationValueResult<T>> {
    try {
        const body = (await req.json()) as T;
        return { value: body };
    } catch {
        return {
            response: jsonError('INVALID_JSON', 'Request body must be valid JSON', { status: 400 }),
        };
    }
}

export function readRequiredSearchParam(req: NextRequest, key: string): AutomationValueResult<string> {
    const value = req.nextUrl.searchParams.get(key)?.trim();

    if (!value) {
        return {
            response: jsonError('INVALID_INPUT', `Missing required query parameter: ${key}`, { status: 400 }),
        };
    }

    return { value };
}

export function normalizeOptionalSearchParam(req: NextRequest, key: string): string | undefined {
    const value = req.nextUrl.searchParams.get(key)?.trim();
    return value ? value : undefined;
}

export function parsePositiveLimit(value: unknown): AutomationValueResult<number | undefined> {
    if (typeof value === 'undefined' || value === null || value === '') {
        return { value: undefined };
    }

    const parsed =
        typeof value === 'number'
            ? value
            : typeof value === 'string'
              ? Number(value.trim())
              : Number.NaN;

    if (!Number.isInteger(parsed) || parsed <= 0) {
        return {
            response: jsonError('INVALID_INPUT', 'limit must be a positive integer', { status: 400 }),
        };
    }

    return { value: parsed };
}
