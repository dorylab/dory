import { getDBService } from '@dory/database';
import { ResponseUtil } from '@/lib/result';
import { authenticateLocalAiBridgeRequest, localAiBridgeResponseContext } from '@/lib/server/local-ai/bridge';
import { localAiProgressSchema, saveLocalAiProgress } from '@/lib/server/local-ai/progress';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ jobId: string }> }) {
    const auth = await authenticateLocalAiBridgeRequest(req);
    if (!auth.ok) return Response.json({ message: auth.message }, { status: auth.status });
    const parsed = localAiProgressSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ message: 'Invalid local AI progress.' }, { status: 400 });
    try {
        const { jobId } = await context.params;
        const owner = localAiBridgeResponseContext(auth.context);
        await saveLocalAiProgress(await getDBService(), owner, jobId, parsed.data);
        return Response.json(ResponseUtil.success({ ok: true }));
    } catch (error) {
        const status = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : 500;
        return Response.json({ message: error instanceof Error ? error.message : 'Unable to save progress.' }, { status });
    }
}
