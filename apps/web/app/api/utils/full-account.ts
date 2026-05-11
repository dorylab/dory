import { NextResponse } from 'next/server';
import { ResponseUtil } from '@/lib/result';
import { ErrorCodes } from '@dory/shared/errors';
import { Locale } from '@dory/i18n/routing';
import { translateApi } from './i18n';

type SessionLike = {
    user?: Record<string, unknown> | null;
} | null;

export function requireFullAccount(session: SessionLike, locale: Locale) {
    const isAnonymous = Boolean((session?.user as { isAnonymous?: boolean | null } | null | undefined)?.isAnonymous);
    if (session?.user && !isAnonymous) {
        return null;
    }

    return NextResponse.json(
        ResponseUtil.error({
            code: ErrorCodes.FORBIDDEN,
            message: translateApi('Api.Chat.Errors.FullAccountRequired', undefined, locale),
        }),
        { status: 403 },
    );
}
