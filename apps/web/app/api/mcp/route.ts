import { NextResponse } from 'next/server';
import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { authenticateMcpRequest } from '@/lib/server/mcp/auth';
import { handleDoryMcpRequest } from '@/lib/server/mcp/server';

export const runtime = 'nodejs';

function jsonError(message: string, status: number) {
    return NextResponse.json(
        {
            jsonrpc: '2.0',
            error: {
                code: status === 401 ? -32001 : -32000,
                message,
            },
            id: null,
        },
        { status },
    );
}

export async function GET() {
    const locale = await getApiLocale();
    return NextResponse.json({ error: translateApi('Api.Mcp.StreamableGetDisabled', undefined, locale) }, { status: 405 });
}

export async function POST(req: Request) {
    const auth = await authenticateMcpRequest(req);
    if (!auth.ok) {
        return jsonError(auth.message, auth.status);
    }

    return handleDoryMcpRequest(req, auth.context);
}
