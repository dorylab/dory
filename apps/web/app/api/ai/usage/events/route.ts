import { withUserAndOrganizationHandler } from '@/app/api/utils/with-organization-handler';

export const runtime = 'nodejs';

const parseBool = (value?: string | null): boolean | null => {
    if (!value) return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true') return true;
    if (normalized === '0' || normalized === 'false') return false;
    return null;
};

export const GET = withUserAndOrganizationHandler(async ({ req, db, organizationId }) => {
    const from = req.nextUrl.searchParams.get('from');
    const to = req.nextUrl.searchParams.get('to');
    const feature = req.nextUrl.searchParams.get('feature');
    const userId = req.nextUrl.searchParams.get('userId');
    const model = req.nextUrl.searchParams.get('model');
    const status = req.nextUrl.searchParams.get('status');
    const fromCache = parseBool(req.nextUrl.searchParams.get('fromCache'));
    const includeTrace = parseBool(req.nextUrl.searchParams.get('includeTrace')) ?? false;
    const cursor = req.nextUrl.searchParams.get('cursor');

    const rawLimit = Number(req.nextUrl.searchParams.get('limit') ?? 50);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.floor(rawLimit))) : 50;

    if (!db?.aiUsage) {
        throw new Error('AI usage repository not available');
    }

    const data = await db.aiUsage.listEvents({
        organizationId,
        from,
        to,
        feature,
        userId,
        model,
        status,
        fromCache,
        includeTrace,
        cursor,
        limit,
    });

    return Response.json(data);
});
