import { NextResponse } from 'next/server';

import { withUserHandler } from '@/app/api/utils/with-organization-handler';
import { getLocalSystemAiProviderStatus } from '@/lib/server/organization-ai-providers/cloud-system-provider';
import { ResponseUtil } from '@/lib/result';

export const runtime = 'nodejs';

export const GET = withUserHandler(async () => {
    return NextResponse.json(
        ResponseUtil.success({
            globalProvider: getLocalSystemAiProviderStatus(),
        }),
    );
});
