'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';
import { IconBrandGithub } from '@tabler/icons-react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { InputPassword } from '@/components/originui/input-password';
import { authClient } from '@/lib/auth-client';
import { authFetch } from '@/lib/client/auth-fetch';
import { refreshDesktopAuthSnapshot } from '@/lib/client/desktop-auth-snapshot';
import { cn } from '@dory/web-utils';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';

type SignInFormProps = React.ComponentProps<'div'> & {
    callbackURL?: string;
    onRequestSignUp?: () => void;
    showGuestOption?: boolean;
    resumeAnonymousSession?: boolean;
};

export function SignInForm({ className, callbackURL: callbackURLOverride, onRequestSignUp, showGuestOption = true, resumeAnonymousSession = false, ...props }: SignInFormProps) {
    const t = useTranslations('Auth');
    const router = useRouter();
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [pwd, setPwd] = useState('');
    const [err, setErr] = useState<string | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const [guestActionLoading, setGuestActionLoading] = useState(false);
    const { data: session } = authClient.useSession();
    const callbackURL = callbackURLOverride || searchParams?.get('callbackURL') || '/';

    function getErrorMessage(error: unknown, fallback: string) {
        return error instanceof Error && error.message ? error.message : fallback;
    }

    useEffect(() => {
        if (!window.authBridge?.onCallback) return;
        const unsubscribe = window.authBridge.onCallback(async deepLink => {
            try {
                const url = new URL(deepLink);
                const path = url.pathname && url.pathname !== '/' ? url.pathname : `/${url.hostname}`;
                const token = url.searchParams.get('token');

                if (path === '/reset-password') {
                    if (!token) {
                        setErr(t('SignIn.MissingToken'));
                        return;
                    }
                    router.replace(`/reset-password?token=${encodeURIComponent(token)}`);
                    return;
                }

                const ticket = url.searchParams.get('ticket');
                const error = url.searchParams.get('error');

                if (error) {
                    setErr(t('SignIn.AuthFailed', { error }));
                    return;
                }

                if (!ticket) {
                    setErr(t('SignIn.MissingToken'));
                    return;
                }

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

                await refreshDesktopAuthSnapshot().catch(() => null);
                setMsg(t('SignIn.SuccessRefreshing'));
                window.location.assign(callbackURL);
            } catch {
                setErr(t('SignIn.InvalidCallback'));
            }
        });

        return () => {
            unsubscribe?.();
        };
    }, [callbackURL, router, session, t]);

    async function signInViaProvider(provider: 'github' | 'google') {
        setErr(null);
        setMsg(null);
        try {
            const res = await authFetch(`/api/electron/auth/start/${provider}`, { method: 'GET' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.url) {
                throw new Error(data?.message || (provider === 'github' ? t('SignIn.GithubStartFailed') : t('SignIn.GoogleStartFailed')));
            }
            await window.authBridge?.openExternal(data.url);
        } catch (error: unknown) {
            setErr(getErrorMessage(error, provider === 'github' ? t('SignIn.GithubStartFailed') : t('SignIn.GoogleStartFailed')));
        }
    }

    async function submitEmailPassword() {
        if (loading) return;

        setErr(null);
        setMsg(null);

        setLoading(true);
        try {
            const res = await fetch('/api/electron/auth/sign-in/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password: pwd }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                const message = typeof data?.error === 'string' ? data.error : t('SignIn.LoginFailedRetry');
                setErr(message);
                posthog.capture('user_sign_in_failed', { method: 'email', error: message });
                return;
            }

            posthog.identify(email, { email });
            posthog.capture('user_signed_in', { method: 'email' });
            await refreshDesktopAuthSnapshot().catch(() => null);
            router.refresh();
            router.push(callbackURL);
        } catch (error: unknown) {
            const message = getErrorMessage(error, t('SignIn.NetworkErrorRetry'));
            setErr(message);
            posthog.capture('user_sign_in_failed', { method: 'email', error: message });
            posthog.captureException(error);
        } finally {
            setLoading(false);
        }
    }

    function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        void submitEmailPassword();
    }

    async function onForgotPassword() {
        if (!email) {
            setErr(t('SignIn.ForgotPasswordEmailRequired'));
            return;
        }
        setErr(null);
        setMsg(null);
        setLoading(true);
        try {
            const res = await authFetch('/api/auth/request-password-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    redirectTo: 'dory://reset-password',
                }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                const message = typeof data?.error === 'string' ? data.error : t('SignIn.ResetEmailFailed');
                setErr(message);
                return;
            }
            setMsg(t('SignIn.ResetEmailSent'));
        } catch (error: unknown) {
            setErr(getErrorMessage(error, t('SignIn.SendFailedRetry')));
        } finally {
            setLoading(false);
        }
    }

    async function onGuestContinue() {
        if (guestActionLoading) return;

        setErr(null);
        setMsg(null);
        setGuestActionLoading(true);

        try {
            if (resumeAnonymousSession) {
                const recoverResponse = await fetch('/api/auth/anonymous/recover', {
                    method: 'POST',
                    credentials: 'include',
                });

                if (!recoverResponse.ok) {
                    const payload = await recoverResponse.json().catch(() => null);
                    throw new Error(typeof payload?.error === 'string' ? payload.error : t('SignIn.Guest.StartFailed'));
                }
            } else {
                const result = await authClient.signIn.anonymous();
                if (result?.error) {
                    throw new Error(result.error.message || t('SignIn.Guest.StartFailed'));
                }
            }

            const response = await fetch('/api/auth/anonymous/bootstrap', {
                method: 'POST',
                credentials: 'include',
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok || !payload?.organizationSlug) {
                throw new Error(typeof payload?.error === 'string' ? payload.error : t('SignIn.Guest.StartFailed'));
            }

            router.refresh();
            router.push(`/${payload.organizationSlug}/connections`);
        } catch (nextError) {
            setErr(nextError instanceof Error ? nextError.message : t('SignIn.Guest.StartFailed'));
        } finally {
            setGuestActionLoading(false);
        }
    }

    return (
        <div className={cn('flex min-w-0 flex-col gap-6', className)} {...props}>
            <Card className="overflow-hidden p-0">
                <CardContent className="grid p-0 md:grid-cols-1">
                    <form className="p-6 md:p-8" onSubmit={onSubmit} data-testid="sign-in-form">
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col items-center text-center">
                                <h1 className="text-2xl font-bold">{t('SignIn.Title')}</h1>
                                <p className="text-muted-foreground text-balance">{t('SignIn.Description')}</p>
                            </div>

                            {err ? (
                                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" data-testid="auth-error">
                                    {err}
                                </div>
                            ) : null}
                            {msg ? (
                                <div className="rounded-md border border-emerald-300/40 bg-emerald-50 p-3 text-sm text-emerald-700" data-testid="auth-message">
                                    {msg}
                                </div>
                            ) : null}

                            <div className="grid grid-cols-2 gap-4">
                                <Button
                                    variant="outline"
                                    type="button"
                                    className="w-full"
                                    aria-label={t('SignIn.LoginWithGithub')}
                                    onClick={() => void signInViaProvider('github')}
                                >
                                    <IconBrandGithub size={20} />
                                    <span>GitHub</span>
                                </Button>
                                <Button
                                    variant="outline"
                                    type="button"
                                    className="w-full"
                                    aria-label={t('SignIn.LoginWithGoogle')}
                                    onClick={() => void signInViaProvider('google')}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                        <path
                                            d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                    <span>Google</span>
                                </Button>
                            </div>

                            <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                                <span className="bg-background text-muted-foreground relative z-10 px-2">{t('SignIn.OrContinueWith')}</span>
                            </div>

                            <div className="grid gap-3">
                                <Label htmlFor="email">{t('SignIn.Email')}</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder={t('SignIn.EmailPlaceholder')}
                                    required
                                    value={email}
                                    onChange={e => setEmail(e.target.value.trim())}
                                    autoComplete="email"
                                />
                            </div>

                            <div className="grid gap-3">
                                <div className="flex items-center">
                                    <Label htmlFor="password">{t('SignIn.Password')}</Label>
                                    <button type="button" onClick={onForgotPassword} className="ml-auto text-sm underline-offset-2 hover:underline">
                                        {t('SignIn.ForgotPassword')}
                                    </button>
                                </div>
                                <InputPassword name="password" id="password" required value={pwd} onChange={e => setPwd(e.target.value)} autoComplete="current-password" />
                            </div>

                            <Button type="button" className="w-full" disabled={loading} onClick={() => void submitEmailPassword()}>
                                {loading ? t('SignIn.Submitting') : t('SignIn.Submit')}
                            </Button>

                            <div className="space-y-2 text-center text-sm">
                                <div>
                                    {t('SignIn.NoAccount')}{' '}
                                    {onRequestSignUp ? (
                                        <button type="button" className="cursor-pointer underline underline-offset-4" onClick={onRequestSignUp}>
                                            {t('SignIn.SignUp')}
                                        </button>
                                    ) : (
                                        <Link href={`/sign-up?callbackURL=${encodeURIComponent(callbackURL)}`} className="cursor-pointer underline underline-offset-4">
                                            {t('SignIn.SignUp')}
                                        </Link>
                                    )}
                                </div>

                                {showGuestOption ? (
                                    <div className="border-border text-muted-foreground border-t pt-4">
                                        <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5">
                                            <span>{t('SignIn.Guest.Prompt')}</span>
                                            <button
                                                type="button"
                                                className="text-foreground inline-flex min-h-5 items-center justify-center gap-1.5 align-middle leading-none cursor-pointer underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline disabled:opacity-70"
                                                disabled={guestActionLoading}
                                                aria-busy={guestActionLoading}
                                                onClick={() => {
                                                    void onGuestContinue();
                                                }}
                                                data-testid="guest-sign-in"
                                            >
                                                {guestActionLoading ? (
                                                    <>
                                                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                                                        <span>{t('SignIn.Guest.Starting')}</span>
                                                    </>
                                                ) : (
                                                    t(resumeAnonymousSession ? 'SignIn.Guest.ResumeAction' : 'SignIn.Guest.Link')
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
                {t('SignIn.ContinueAgreement')} <a href="#">{t('SignIn.Terms')}</a> {t('SignIn.And')} <a href="#">{t('SignIn.Privacy')}</a>.
            </div>
        </div>
    );
}
