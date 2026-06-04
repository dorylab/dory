'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';
import { Loader2, RefreshCcw, Mail } from 'lucide-react';
import { authFetch } from '@/lib/client/auth-fetch';
import { useTranslations } from 'next-intl';
import { authClient } from '@/lib/auth-client';
import { getEmailVerificationCallbackURL } from '@/lib/client/auth-runtime';

export function VerifyEmailPanel(props: {
    defaultEmail: string;
    callbackURL?: string;
    onChangeEmail?: (email: string) => void; //Optional: Allow changing mailboxes within the panel
}) {
    const t = useTranslations('Auth');
    const { data: session } = authClient.useSession();
    const [email, setEmail] = useState(props.defaultEmail);
    const [cooldown, setCooldown] = useState(0);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const callbackURL = props.callbackURL || '/';

    useEffect(() => {
        if (!cooldown) return;
        const t = setInterval(() => setCooldown(s => (s > 0 ? s - 1 : 0)), 1000);
        return () => clearInterval(t);
    }, [cooldown]);

    useEffect(() => {
        if (!window.authBridge?.onCallback) return;

        const unsubscribe = window.authBridge.onCallback(async deepLink => {
            try {
                const url = new URL(deepLink);
                const error = url.searchParams.get('error');
                if (error) {
                    setErr(t('SignIn.AuthFailed', { error }));
                    return;
                }

                const ticket = url.searchParams.get('ticket');
                if (!ticket) {
                    setErr(t('SignIn.MissingToken'));
                    return;
                }

                setLoading(true);
                setErr(null);
                setMsg(null);

                const consumeRes = await fetch('/api/electron/auth/consume', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ticket,
                        anonymousUserId: session?.user?.isAnonymous ? session.user.id : null,
                        anonymousActiveOrganizationId: session?.user?.isAnonymous
                            ? ((session.session as { activeOrganizationId?: string | null } | undefined)?.activeOrganizationId ?? null)
                            : null,
                    }),
                });

                if (!consumeRes.ok) {
                    const data = await consumeRes.json().catch(() => null);
                    throw new Error(data?.error ?? t('SignIn.AuthFailed', { error: 'consume_failed' }));
                }

                setMsg(t('SignIn.SuccessRefreshing'));
                window.location.assign(callbackURL);
            } catch {
                setErr(t('SignIn.InvalidCallback'));
            } finally {
                setLoading(false);
            }
        });

        return () => {
            unsubscribe?.();
        };
    }, [callbackURL, session, t]);

    async function resend() {
        setErr(null);
        setMsg(null);
        setLoading(true);
        try {
            const verificationCallbackURL = getEmailVerificationCallbackURL(callbackURL);
            const res = await authFetch('/api/auth/resend-verification', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email, callbackURL: verificationCallbackURL }),
            });
            const data = await res.json();
            if (!res.ok) {
                setErr(data?.message || t('VerifyEmail.ResendFailed'));
            } else {
                setMsg(data?.message || t('VerifyEmail.Sent'));
                setCooldown(60);
            }
        } catch {
            setErr(t('VerifyEmail.NetworkError'));
        } finally {
            setLoading(false);
        }
    }

    function openMailApp() {
        window.open(`mailto:${email}`, '_blank'); //Simple placeholder; you can also jump to common webmail
    }

    return (
        <div className="rounded-xl border border-border bg-card text-card-foreground p-4 md:p-6 space-y-4">
            <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                    <h2 className="text-base font-semibold">{t('VerifyEmail.Title')}</h2>
                    <p className="text-sm text-muted-foreground">
                        {t('VerifyEmail.DescriptionPrefix')}{' '}
                        <span className="font-medium">{email}</span> {t('VerifyEmail.DescriptionSuffix')}
                    </p>
                </div>
            </div>

            <div className="grid gap-3">
                <Label htmlFor="email">{t('VerifyEmail.EmailLabel')}</Label>
                <div className="flex gap-2">
                    <Input id="email" value={email} onChange={e => setEmail(e.target.value.trim())} type="email" className="flex-1" />
                    {props.onChangeEmail && (
                        <Button type="button" variant="secondary" onClick={() => props.onChangeEmail?.(email)}>
                            {t('VerifyEmail.Change')}
                        </Button>
                    )}
                </div>
                <p className="text-xs text-muted-foreground">{t('VerifyEmail.Hint')}</p>
            </div>

            {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
            {msg && <p className="text-sm text-green-600 dark:text-green-400">{msg}</p>}

            <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={openMailApp} variant="outline">
                    {t('VerifyEmail.OpenMailApp')}
                </Button>

                <Button type="button" onClick={resend} disabled={loading || cooldown > 0} className="inline-flex items-center gap-2">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                    {cooldown > 0 ? t('VerifyEmail.ResendCooldown', { seconds: cooldown }) : t('VerifyEmail.Resend')}
                </Button>
            </div>
        </div>
    );
}
