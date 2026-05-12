import { NextResponse } from 'next/server';
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
    return NextResponse.json({ error: 'MCP Streamable HTTP GET is not enabled in Dory v1.' }, { status: 405 });
}

export async function POST(req: Request) {
    const auth = await authenticateMcpRequest(req);
    if (!auth.ok) {
        return jsonError(auth.message, auth.status);
    }

    return handleDoryMcpRequest(req, auth.context);
}
