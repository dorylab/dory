import { NextResponse } from 'next/server';
import { isAnonymousUser } from '@/lib/auth/anonymous-user';
import { ErrorCodes } from '@dory/shared/errors';
import { ResponseUtil } from '@/lib/result';
import { translateApi } from '@/app/api/utils/i18n';

export function requireFullAccount(session: { user?: unknown } | null | undefined, locale: Parameters<typeof translateApi>[2]) {
    if (!isAnonymousUser(session?.user)) {
        return null;
    }

    return NextResponse.json(
        ResponseUtil.error({
            code: ErrorCodes.FORBIDDEN,
            message: translateApi('Api.Errors.FullAccountRequired', undefined, locale),
        }),
        { status: 403 },
    );
}
