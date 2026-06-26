import { getDBService } from '@dory/database';
import { handleDoryMcpRequest as handleDoryMcpCoreRequest } from '@dory/server-core/mcp';
import type { McpAuthContext } from './auth';

export async function handleDoryMcpRequest(req: Request, context: McpAuthContext): Promise<Response> {
    return handleDoryMcpCoreRequest(req, {
        db: await getDBService(),
        auth: context,
        requestOrigin: context.requestOrigin ?? null,
    });
}
