/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { ErrorCodes } from '@/lib/errors';
import { ResponseUtil } from '@/lib/result';
import { ensureConnectionPoolForUser } from '../../utils';
import { hasMetadataCapability } from '@/lib/connection/base/types';
import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    return withUserAndOrganizationHandler(async ({ userId, organizationId }) => {
        const locale = await getApiLocale();
        const t = (key: string, values?: Record<string, unknown>) => translateApi(key, values, locale);
        const headerId = req.headers.get('x-connection-id');
        const datasourceId = (await context?.params)?.id ?? headerId;

        if (!datasourceId) {
            return NextResponse.json(
                ResponseUtil.error({ code: ErrorCodes.INVALID_PARAMS, message: t('Api.Connection.Errors.MissingConnectionId') }),
                { status: 400 },
            );
        }

        try {
            const url = new URL(req.url);
            const databaseParam = url.searchParams.get('database');

            const { entry, config } = await ensureConnectionPoolForUser(userId, organizationId, datasourceId, null);
            const metadata = entry.instance.capabilities.metadata;

            const targetDatabase = databaseParam ?? (typeof config.database === 'string' ? config.database : 'default');
            if (!hasMetadataCapability(metadata, 'getSchema')) {
                throw new Error(t('Api.Connection.Errors.SchemaReadFailed'));
            }

            const schema = await metadata.getSchema(targetDatabase);

            return NextResponse.json({ ok: true, schema });
        } catch (error) {
            console.error('[connection] schema read failed', error);
            return NextResponse.json(
                {
                    ok: false,
                    error: t('Api.Connection.Errors.SchemaReadFailed'),
                },
                { status: 500 },
            );
        }
    })(req);
}
