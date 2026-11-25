import 'server-only';

import type { DBService } from '@dory/database';
import { translate } from '@dory/i18n/translate';
import type { DocumentGenerationInput } from '@dory/shared/types/knowledge-document-draft';
import type { NextRequest } from 'next/server';

import { resolveAiExecution } from '@/lib/ai/execution/resolver';
import { createAuthProxyHeaders, shouldProxyAuthRequest } from '@/lib/auth/auth-proxy';
import { readDesktopAuthSnapshot } from '@/lib/auth/desktop-auth-snapshot';
import { getSessionFromRequest } from '@/lib/auth/session';
import { getCloudApiBaseUrl } from '@/lib/cloud/url';
import { resolveLocalOrganizationAccess } from '@/lib/server/authz/authz.local';
import type { OrganizationAccess } from '@/lib/server/authz/types';
import { captureDocumentGenerationRequest, restoreDocumentGenerationRequest } from './knowledge-document-generation-context';
import { DocumentDraftValidationError } from './knowledge-document-draft';
import { generateDocumentDraft } from './knowledge-document-generation';

const runners = new WeakMap<DBService, DocumentGenerationRunner>();

// Persist only the authentication headers needed by cloud execution, encrypted at rest.
export async function documentGenerationExecutionContext(db: DBService, organizationId: string, req?: NextRequest): Promise<string | null> {
    const execution = await resolveAiExecution({ db, organizationId, req, role: 'action', includeModel: false });
    if (execution.transport !== 'cloud' && (!shouldProxyAuthRequest() || readDesktopAuthSnapshot()?.access?.isMember)) return null;
    if (!req) throw new Error('Authentication is required for background cloud execution.');
    return captureDocumentGenerationRequest(req);
}

async function taskAccess(organizationId: string, userId: string, req?: NextRequest): Promise<OrganizationAccess | null> {
    const snapshot = readDesktopAuthSnapshot();
    if (snapshot?.user.id === userId && snapshot.access?.isMember && snapshot.access.userId === userId && snapshot.access.organizationId === organizationId) return snapshot.access;
    if (!shouldProxyAuthRequest()) return resolveLocalOrganizationAccess(organizationId, userId);
    if (!req || (await getSessionFromRequest(req))?.user?.id !== userId) throw new Error('AUTH_REQUIRED');
    const base = getCloudApiBaseUrl();
    if (!base) throw new Error('AUTH_REQUIRED');
    const response = await fetch(new URL(`/api/organization/access?organizationId=${encodeURIComponent(organizationId)}`, base), {
        headers: createAuthProxyHeaders(req.headers, base),
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 401) throw new Error('AUTH_REQUIRED');
    if (!response.ok) throw new Error('ACCESS_DENIED');
    const result = (await response.json()) as { code?: number; data?: { access?: OrganizationAccess } };
    return result.code === 0 ? (result.data?.access ?? null) : null;
}

class DocumentGenerationRunner {
    private running = false;
    private requested = false;
    constructor(private readonly db: DBService) {}

    wake() {
        this.requested = true;
        if (this.running) return;
        this.running = true;
        void this.drain()
            .catch(() => console.error('[document-generation] Worker failed; tasks will recover on the next scan.'))
            .finally(() => {
                this.running = false;
                if (this.requested) this.wake();
            });
    }

    private async drain() {
        const store = this.db.knowledge.documentGeneration;
        do {
            this.requested = false;
            for (;;) {
                const task = await store.claim();
                if (!task) break;
                const token = task.leaseToken!;
                const controller = new AbortController();
                const heartbeat = setInterval(() => {
                    void store.heartbeat(task.id, token).catch(() => controller.abort());
                }, 30_000);
                heartbeat.unref?.();
                try {
                    const req = await restoreDocumentGenerationRequest(task.executionContext);
                    const access = await taskAccess(task.organizationId, task.createdBy, req);
                    if (!access?.isMember || !access.permissions.workspace.read || !access.permissions.connection.read) throw new Error('ACCESS_DENIED');
                    const draft = await generateDocumentDraft(
                        {
                            db: this.db,
                            organizationId: task.organizationId,
                            userId: task.createdBy,
                            requestId: task.id,
                            req,
                            signal: controller.signal,
                        },
                        task.input,
                        progress => store.heartbeat(task.id, token, progress),
                    );
                    await store.complete(task.id, token, draft);
                } catch (error) {
                    const code = error instanceof Error ? error.message : '';
                    const locale: DocumentGenerationInput['locale'] = task.input.locale;
                    const auth = code === 'AUTH_REQUIRED' || /\b401\b|unauthorized|session.*expired/i.test(code);
                    const message = auth
                        ? 'AUTH_REQUIRED'
                        : code === 'ACCESS_DENIED'
                          ? 'ACCESS_DENIED'
                          : error instanceof DocumentDraftValidationError
                            ? error.message
                            : code === translate(locale, 'Knowledge.Generation.TooLarge') || code === translate(locale, 'Knowledge.Generation.InvalidDraft')
                              ? code
                              : 'GENERATION_FAILED';
                    // Never persist provider payloads, schema content, or credentials in diagnostics.
                    await store.fail(task.id, token, message);
                } finally {
                    clearInterval(heartbeat);
                    controller.abort();
                }
            }
        } while (this.requested);
    }
}

export function getDocumentGenerationRunner(db: DBService) {
    let runner = runners.get(db);
    if (!runner) {
        runner = new DocumentGenerationRunner(db);
        runners.set(db, runner);
    }
    return runner;
}
