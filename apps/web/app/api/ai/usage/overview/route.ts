import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

export const runtime = 'nodejs';

export const GET = withUserAndOrganizationHandler(async ({ req, db, organizationId }) => {
    const from = req.nextUrl.searchParams.get('from');
    const to = req.nextUrl.searchParams.get('to');
    const feature = req.nextUrl.searchParams.get('feature');
    const userId = req.nextUrl.searchParams.get('userId');
    const model = req.nextUrl.searchParams.get('model');

    if (!db?.aiUsage) {
        throw new Error('AI usage repository not available');
    }

    const data = await db.aiUsage.getOverview({
        organizationId,
        from,
        to,
        feature,
        userId,
        model,
    });

    return Response.json(data);
});
