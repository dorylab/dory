import type { NextRequest } from 'next/server';

import { getConnectionIdFromRequest } from '@dory/web-utils/request';
import { BadRequestError } from './parse-json';

const normalizeConnectionId = (value?: string | null) => {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

export function requireConnectionId(
    req: NextRequest,
    t: (key: string, values?: Record<string, unknown>) => string,
) {
    const connectionId = normalizeConnectionId(getConnectionIdFromRequest(req));
    if (!connectionId) {
        throw new BadRequestError(t('Api.SqlConsole.Tabs.MissingConnectionContext'));
    }
    return connectionId;
}
