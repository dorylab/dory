import type { NextRequest } from 'next/server';
import { documentHttp } from '@/lib/server/work-document-http';
export const GET = (req: NextRequest) => documentHttp(req);

export const POST = (req: NextRequest) => documentHttp(req);
