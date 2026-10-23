import type { NextRequest } from 'next/server';
import { documentHttp } from '@/lib/server/work-document-http';
type Context = { params: Promise<{ documentId: string }> };
export async function GET(req: NextRequest, context: Context) {
    return documentHttp(req, (await context.params).documentId);
}
export async function PATCH(req: NextRequest, context: Context) {
    return documentHttp(req, (await context.params).documentId);
}
