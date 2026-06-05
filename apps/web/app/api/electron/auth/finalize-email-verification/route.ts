import { buildElectronAuthDeepLinkUrl, createElectronAuthFinalizeResponse, getElectronAuthFinalizePageCopy } from '@/app/api/electron/auth/finalize-page';
import { getApiLocale } from '@/app/api/utils/i18n';
import { getAuth } from '@/lib/auth';
import { verifyElectronEmailVerificationState } from '@/lib/auth/electron-email-verification';
import { buildElectronTicketUser } from '@/lib/auth/migration-state';
import { getClient } from '@dory/database/postgres/client';
import { schema } from '@dory/database/schema';
import type { PostgresDBClient } from '@dory/shared';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TICKET_TTL_MS = 5 * 60 * 1000;

type TicketUser = {
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
    emailVerified: boolean;
    activeOrganizationId?: string | null;
};

async function createTicket(auth: Awaited<ReturnType<typeof getAuth>>, payload: { user: TicketUser }) {
    const ctx = await auth.$context;
    const ticket = `electron-${randomUUID()}`;
    const verification = await ctx.internalAdapter.createVerificationValue({
        value: JSON.stringify(payload),
        identifier: ticket,
        expiresAt: new Date(Date.now() + TICKET_TTL_MS),
    });

    if (!verification) {
        throw new Error('failed_to_create_ticket');
    }

    return ticket;
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const locale = await getApiLocale();
    const copy = getElectronAuthFinalizePageCopy(locale);
    const emailVerificationState = verifyElectronEmailVerificationState(url.searchParams.get('state'));

    if (!emailVerificationState) {
        const deepLinkUrl = buildElectronAuthDeepLinkUrl({ error: 'invalid_email_verification_state' });
        return createElectronAuthFinalizeResponse(req, deepLinkUrl, copy);
    }

    const db = (await getClient()) as PostgresDBClient;
    const [dbUser] = await db.select().from(schema.user).where(eq(schema.user.id, emailVerificationState.userId));
    if (!dbUser || dbUser.email.toLowerCase() !== emailVerificationState.email || !dbUser.emailVerified) {
        const deepLinkUrl = buildElectronAuthDeepLinkUrl({ error: 'email_verification_user_not_ready' });
        return createElectronAuthFinalizeResponse(req, deepLinkUrl, copy);
    }

    const auth = await getAuth();
    const user = buildElectronTicketUser({
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        image: dbUser.image,
        emailVerified: dbUser.emailVerified,
        activeOrganizationId: null,
    }) satisfies TicketUser;
    const ticket = await createTicket(auth, { user });
    const deepLinkUrl = buildElectronAuthDeepLinkUrl({ ticket });

    return createElectronAuthFinalizeResponse(req, deepLinkUrl, copy);
}
