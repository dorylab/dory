import { getDBService } from '@dory/database';
import { finishDriveAuthorization } from '@/lib/server/google-drive';

export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
    try {
        await finishDriveAuthorization(await getDBService(), params.get('state') ?? '', params.get('code'));
        return new Response('Google Drive connected. Return to Dory to choose a folder.', { headers });
    } catch {
        return new Response('Authorization did not complete. Return to Dory and try again.', { status: 400, headers });
    }
}
