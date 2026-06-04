import { getApiLocale, translateApi } from '@/app/api/utils/i18n';
import { getAuth } from '@/lib/auth';
import { verifyElectronEmailVerificationState } from '@/lib/auth/electron-email-verification';
import { buildElectronTicketUser } from '@/lib/auth/migration-state';
import { getClient } from '@dory/database/postgres/client';
import { schema } from '@dory/database/schema';
import type { PostgresDBClient } from '@dory/shared';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEEP_LINK = 'dory://auth-complete';
const TICKET_TTL_MS = 5 * 60 * 1000;

type TicketUser = {
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
    emailVerified: boolean;
    activeOrganizationId?: string | null;
};

type FinalizePageCopy = {
    title: string;
    description: string;
    openApp: string;
    closePage: string;
    hint: string;
};

function buildDeepLinkUrl(params: Record<string, string | undefined | null>) {
    const deepLinkUrl = new URL(DEEP_LINK);
    for (const [key, value] of Object.entries(params)) {
        if (value) {
            deepLinkUrl.searchParams.set(key, value);
        }
    }
    return deepLinkUrl.toString();
}

function getFinalizePageCopy(locale: Awaited<ReturnType<typeof getApiLocale>>): FinalizePageCopy {
    return {
        title: translateApi('Api.ElectronAuthFinalize.Title', undefined, locale),
        description: translateApi('Api.ElectronAuthFinalize.Description', undefined, locale),
        openApp: translateApi('Api.ElectronAuthFinalize.OpenApp', undefined, locale),
        closePage: translateApi('Api.ElectronAuthFinalize.ClosePage', undefined, locale),
        hint: translateApi('Api.ElectronAuthFinalize.Hint', undefined, locale),
    };
}

function createDeepLinkResponse(deepLinkUrl: string, copy: FinalizePageCopy) {
    return new NextResponse(
        `
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${copy.title}</title>
          <style>
            :root {
              color-scheme: light;
            }
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              background: linear-gradient(180deg, #f7fafc 0%, #eef2f7 100%);
              color: #1f2937;
            }
            .card {
              width: min(560px, calc(100vw - 32px));
              background: #fff;
              border: 1px solid #e5e7eb;
              border-radius: 14px;
              padding: 24px;
              box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
            }
            h1 {
              margin: 0 0 8px;
              font-size: 22px;
              line-height: 1.3;
            }
            p {
              margin: 0;
              line-height: 1.6;
              color: #4b5563;
            }
            .actions {
              margin-top: 18px;
              display: flex;
              gap: 10px;
              flex-wrap: wrap;
            }
            a, button {
              border-radius: 10px;
              border: 1px solid #cbd5e1;
              background: #f8fafc;
              color: #0f172a;
              padding: 10px 14px;
              font-size: 14px;
              text-decoration: none;
              cursor: pointer;
            }
            a.primary {
              background: #0f172a;
              border-color: #0f172a;
              color: #fff;
            }
            .hint {
              margin-top: 14px;
              font-size: 13px;
              color: #6b7280;
            }
          </style>
        </head>
        <body>
          <main class="card">
            <h1>${copy.title}</h1>
            <p>${copy.description}</p>
            <div class="actions">
              <a id="open-link" class="primary" href=${JSON.stringify(deepLinkUrl)}>${copy.openApp}</a>
              <button id="close-btn" type="button">${copy.closePage}</button>
            </div>
            <p class="hint">${copy.hint}</p>
          </main>
          <script>
            const deepLinkUrl = ${JSON.stringify(deepLinkUrl)};
            const openLink = document.getElementById('open-link');
            const closeBtn = document.getElementById('close-btn');
            if (openLink) {
              openLink.setAttribute('href', deepLinkUrl);
            }
            if (closeBtn) {
              closeBtn.addEventListener('click', () => window.close());
            }

            setTimeout(() => {
              window.location.assign(deepLinkUrl);
            }, 200);
          </script>
        </body>
      </html>
    `,
        { headers: { 'Content-Type': 'text/html' } },
    );
}

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
    const copy = getFinalizePageCopy(locale);
    const emailVerificationState = verifyElectronEmailVerificationState(url.searchParams.get('state'));

    if (!emailVerificationState) {
        const deepLinkUrl = buildDeepLinkUrl({ error: 'invalid_email_verification_state' });
        return createDeepLinkResponse(deepLinkUrl, copy);
    }

    const db = (await getClient()) as PostgresDBClient;
    const [dbUser] = await db.select().from(schema.user).where(eq(schema.user.id, emailVerificationState.userId));
    if (!dbUser || dbUser.email.toLowerCase() !== emailVerificationState.email || !dbUser.emailVerified) {
        const deepLinkUrl = buildDeepLinkUrl({ error: 'email_verification_user_not_ready' });
        return createDeepLinkResponse(deepLinkUrl, copy);
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
    const deepLinkUrl = buildDeepLinkUrl({ ticket });

    return createDeepLinkResponse(deepLinkUrl, copy);
}
