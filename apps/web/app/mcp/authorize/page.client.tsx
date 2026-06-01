'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Cable, CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { authFetch } from '@/lib/client/auth-fetch';

type McpAuthorizationRequest = {
    id: string;
    clientName: string;
    scopes: string[];
    status: string;
    expiresAt: string | Date;
    createdAt: string | Date;
};

type DecisionState = 'missing' | 'not_found' | 'pending' | 'approved' | 'denied' | 'expired' | 'consumed';

async function readJson<T>(res: Response): Promise<T> {
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.code !== 0) {
        throw new Error(json?.message ?? 'Request failed');
    }
    return json.data as T;
}

function formatDate(value: string | Date) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
}

export function McpAuthorizeClient({
    requestId,
    request,
    state: initialState,
    canApprove,
    missingOrganization,
    userLabel,
}: {
    requestId: string;
    request: McpAuthorizationRequest | null;
    state: DecisionState;
    canApprove: boolean;
    missingOrganization: boolean;
    userLabel: string;
}) {
    const t = useTranslations('McpAuthorize');
    const [state, setState] = useState(initialState);
    const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
    const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

    const decide = async (action: 'approve' | 'deny') => {
        if (!requestId) return;
        setBusy(action);
        setMessage(null);
        try {
            const payload = await readJson<{ status: DecisionState }>(
                await authFetch(`/api/mcp/link/${action}`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ requestId }),
                }),
            );
            setState(payload.status === 'approved' || action === 'approve' ? 'approved' : 'denied');
            setMessage({ type: 'success', text: action === 'approve' ? t('Approved') : t('Denied') });
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : t('Failed') });
        } finally {
            setBusy(null);
        }
    };

    const unavailable = state !== 'pending' || !request;

    return (
        <section className="space-y-5 rounded-lg border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Cable className="size-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="min-w-0 truncate text-base font-semibold">{request?.clientName ?? t('UnknownClient')}</h2>
                        <StateBadge state={state} />
                    </div>
                    <p className="text-sm text-muted-foreground">{t('SignedInAs', { user: userLabel })}</p>
                </div>
            </div>

            {request ? (
                <div className="grid gap-3 rounded-md border bg-muted/20 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{t('Expires')}</span>
                        <span className="text-right font-medium">{formatDate(request.expiresAt)}</span>
                    </div>
                    <div className="space-y-2">
                        <span className="text-muted-foreground">{t('Scopes')}</span>
                        <div className="flex flex-wrap gap-1.5">
                            {request.scopes.map(scope => (
                                <Badge key={scope} variant="outline" className="rounded-md">
                                    {scope}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">{t('RequestUnavailable')}</div>
            )}

            {missingOrganization ? <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{t('MissingOrganization')}</div> : null}

            {unavailable ? <StateMessage state={state} /> : null}

            {message ? (
                <div
                    className={
                        message.type === 'error'
                            ? 'rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive'
                            : 'rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600 dark:text-green-400'
                    }
                >
                    {message.text}
                </div>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" disabled={!requestId || busy !== null || state !== 'pending'} onClick={() => void decide('deny')}>
                    <XCircle className="size-4" />
                    {t('Deny')}
                </Button>
                <Button disabled={!canApprove || busy !== null || state !== 'pending'} onClick={() => void decide('approve')}>
                    <CheckCircle2 className="size-4" />
                    {t('Approve')}
                </Button>
            </div>
        </section>
    );
}

function StateBadge({ state }: { state: DecisionState }) {
    const t = useTranslations('McpAuthorize.State');
    const variant = state === 'pending' ? 'secondary' : state === 'approved' ? 'default' : state === 'missing' || state === 'not_found' ? 'outline' : 'destructive';
    return <Badge variant={variant}>{t(state)}</Badge>;
}

function StateMessage({ state }: { state: DecisionState }) {
    const t = useTranslations('McpAuthorize');
    if (state === 'pending') return null;
    const icon = state === 'approved' ? <CheckCircle2 className="size-4" /> : state === 'expired' ? <Clock3 className="size-4" /> : <XCircle className="size-4" />;
    return (
        <div className="flex items-start gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            <span className="mt-0.5 shrink-0">{icon}</span>
            <span>{t(`Messages.${state}`)}</span>
        </div>
    );
}
