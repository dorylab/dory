import { NextRequest, NextResponse } from 'next/server';

import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@/lib/errors';
import { resolveClickhouseDatasource, handlePrivilegesError } from '../../../_utils';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { withUserAndTeamHandler } from '@/app/api/utils/with-team-handler';

type ScopedPrivilegePayload = {
    privileges: string[];
    scope: 'database' | 'table' | 'view';
    database: string;
    object?: string | null;
    grantOption?: boolean;
};

function normalizeScopeValue(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
}

async function parseScopedPayload(req: NextRequest): Promise<ScopedPrivilegePayload | null> {
    try {
        const body = (await req.json()) as ScopedPrivilegePayload;
        if (!body || !Array.isArray(body.privileges)) return null;
        const scope = typeof body.scope === 'string' ? body.scope.toLowerCase() : '';
        if (!['database', 'table', 'view'].includes(scope)) return null;
        const database = normalizeScopeValue(body.database);
        if (!database) return null;
        const object = normalizeScopeValue(body.object);
        if (scope !== 'database' && !object) return null;
        return {
            privileges: body.privileges,
            scope: scope as ScopedPrivilegePayload['scope'],
            database,
            object: scope === 'database' ? null : object ?? null,
            grantOption: Boolean(body.grantOption),
        };
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest, context: { params: Promise<{ name: string }> }) {
    const locale = await getApiLocale();
    return withUserAndTeamHandler(async ({ req, teamId }) => {
        const resolved = await resolveClickhouseDatasource(req, { teamId });
        if (resolved.response) return resolved.response;
        const params = await context.params;
        const payload = await parseScopedPayload(req);

        if (!payload) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.VALIDATION_ERROR,
                    message: translateApi('Api.Errors.BodyParseFailed', undefined, locale),
                }),
                { status: 400 },
            );
        }

        try {
            await resolved.resolved!.instance.privileges.grantUserScopedPrivileges({
                name: params.name,
                privileges: payload.privileges,
                database: payload.database,
                object: payload.object ?? undefined,
                grantOption: payload.grantOption,
                scopeType: payload.scope,
            });
            return NextResponse.json(ResponseUtil.success());
        } catch (error) {
            return handlePrivilegesError(error, translateApi('Api.Privileges.Users.GrantScopedFailed', undefined, locale));
        }
    })(req);
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ name: string }> }) {
    const locale = await getApiLocale();
    return withUserAndTeamHandler(async ({ req, teamId }) => {
        const resolved = await resolveClickhouseDatasource(req, { teamId });
        if (resolved.response) return resolved.response;
        const params = await context.params;
        const payload = await parseScopedPayload(req);

        if (!payload) {
            return NextResponse.json(
                ResponseUtil.error({
                    code: ErrorCodes.VALIDATION_ERROR,
                    message: translateApi('Api.Errors.BodyParseFailed', undefined, locale),
                }),
                { status: 400 },
            );
        }

        try {
            await resolved.resolved!.instance.privileges.revokeUserScopedPrivileges({
                name: params.name,
                privileges: payload.privileges,
                database: payload.database,
                object: payload.object ?? undefined,
                scopeType: payload.scope,
            });
            return NextResponse.json(ResponseUtil.success());
        } catch (error) {
            return handlePrivilegesError(error, translateApi('Api.Privileges.Users.RevokeScopedFailed', undefined, locale));
        }
    })(req);
}
