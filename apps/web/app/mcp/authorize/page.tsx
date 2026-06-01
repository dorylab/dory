import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getDBService } from '@dory/database';
import { getSessionFromRequest } from '@/lib/auth/session';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import { serializeMcpAuthorizationRequest } from '@/lib/server/mcp/settings';
import { McpAuthorizeClient } from './page.client';

export const dynamic = 'force-dynamic';

export default async function McpAuthorizePage({ searchParams }: { searchParams: Promise<{ requestId?: string }> }) {
    const params = await searchParams;
    const requestId = params.requestId?.trim() ?? '';
    const callbackURL = `/mcp/authorize${requestId ? `?requestId=${encodeURIComponent(requestId)}` : ''}`;
    const session = await getSessionFromRequest();

    if (!session) {
        redirect(`/sign-in?callbackURL=${encodeURIComponent(callbackURL)}`);
    }

    const t = await getTranslations('McpAuthorize');
    const organizationId = resolveCurrentOrganizationId(session);
    let request: ReturnType<typeof serializeMcpAuthorizationRequest> | null = null;
    let state: 'missing' | 'not_found' | 'pending' | 'approved' | 'denied' | 'expired' | 'consumed' = requestId ? 'not_found' : 'missing';

    if (requestId) {
        const db = await getDBService();
        const pollState = await db.mcp.getAuthorizationPollState({ id: requestId });
        state = pollState.status === 'verifier_mismatch' ? 'not_found' : pollState.status;
        request = pollState.record ? serializeMcpAuthorizationRequest(pollState.record) : null;
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
            <div className="w-full max-w-lg space-y-6">
                <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">{t('Eyebrow')}</div>
                    <h1 className="text-2xl font-semibold tracking-tight">{t('Title')}</h1>
                    <p className="text-sm leading-6 text-muted-foreground">{t('Description')}</p>
                </div>
                <McpAuthorizeClient
                    requestId={requestId}
                    request={request}
                    state={state}
                    canApprove={Boolean(organizationId && state === 'pending')}
                    missingOrganization={!organizationId}
                    userLabel={session.user.email ?? session.user.name ?? session.user.id}
                />
            </div>
        </main>
    );
}
