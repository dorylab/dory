'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';

import { cn } from '@dory/web-utils';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';
import { IconBrandGithub } from '@tabler/icons-react';
import { authClient, signInViaGithub, signInViaGoogle } from '@/lib/auth-client';
import { InputPassword } from '@/components/originui/input-password';
import { authFetch } from '@/lib/client/auth-fetch';
import { useTranslations } from 'next-intl';

type SignInFormProps = React.ComponentProps<'div'> & {
    callbackURL?: string;
    onRequestSignUp?: () => void;
    showGuestOption?: boolean;
    showDemoOption?: boolean;
    resumeAnonymousSession?: boolean;
};

export function SignInForm({
    className,
    callbackURL: callbackURLOverride,
    onRequestSignUp,
    showGuestOption = true,
    showDemoOption = true,
    resumeAnonymousSession = false,
    ...props
}: SignInFormProps) {
    const t = useTranslations('Auth');
    const router = useRouter();
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [pwd, setPwd] = useState('');
    const [err, setErr] = useState<string | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const [guestActionLoading, setGuestActionLoading] = useState(false);
    const [demoActionLoading, setDemoActionLoading] = useState(false);
    const { data: session, refetch: refetchSession } = authClient.useSession();
    const callbackURL = callbackURLOverride || searchParams?.get('callbackURL') || '/';
    const canShowDemoOption = showDemoOption;
    const secondaryActionLoading = guestActionLoading || demoActionLoading;

    async function recoverAnonymousSessionIfNeeded() {
        if (!session?.user?.isAnonymous && !resumeAnonymousSession) {
            return true;
        }

        const recoverResponse = await fetch('/api/auth/anonymous/recover', {
            method: 'POST',
            credentials: 'include',
        });

        if (!recoverResponse.ok) {
            const payload = await recoverResponse.json().catch(() => null);
            throw new Error(typeof payload?.error === 'string' ? payload.error : t('SignIn.Guest.StartFailed'));
        }

        return true;
    }

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setErr(null);
        setMsg(null);
        setLoading(true);
        try {
            await recoverAnonymousSessionIfNeeded();
            const { error } = await authClient.signIn.email({
                email,
                password: pwd,
                callbackURL,
            });
            if (error) {
                setErr(error.message ?? t('SignIn.LoginFailedRetry'));
                posthog.capture('user_sign_in_failed', { method: 'email', error: error.message });
            } else {
                posthog.identify(email, { email });
                posthog.capture('user_signed_in', { method: 'email' });
                router.push(callbackURL);
            }
        } catch (e: any) {
            setErr(e?.message ?? t('SignIn.NetworkErrorRetry'));
            posthog.capture('user_sign_in_failed', { method: 'email', error: e?.message });
            posthog.captureException(e);
        } finally {
            setLoading(false);
        }
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
            const redirectTo = `${window.location.origin}/reset-password`;
            const res = await authFetch('/api/auth/request-password-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    // After the link opens, it jumps to your reset password page
                    redirectTo,
                }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                const message = typeof data?.error === 'string' ? data.error : t('SignIn.ResetEmailFailed');
                setErr(message);
                return;
            }
            setMsg(t('SignIn.ResetEmailSent'));
        } catch (e: any) {
            console.error('[auth] request-password-reset error', e);
            setErr(e?.message ?? t('SignIn.SendFailedRetry'));
        } finally {
            setLoading(false);
        }
    }

    async function onGuestContinue() {
        if (loading || secondaryActionLoading) return;

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

    async function onDemoContinue() {
        if (loading || secondaryActionLoading) return;

        setErr(null);
        setMsg(null);
        setDemoActionLoading(true);

        try {
            const response = await fetch('/api/auth/demo', {
                method: 'POST',
                credentials: 'include',
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(typeof payload?.error === 'string' ? payload.error : t('SignIn.Demo.StartFailed'));
            }

            await refetchSession();
            router.refresh();
            router.push(callbackURL);
        } catch (nextError) {
            setErr(nextError instanceof Error ? nextError.message : t('SignIn.Demo.StartFailed'));
        } finally {
            setDemoActionLoading(false);
        }
    }

    return (
        <>
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
                                        <button type="button" onClick={onForgotPassword} className="ml-auto text-sm underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50">
                                            {t('SignIn.ForgotPassword')}
                                        </button>
                                    </div>
                                    <InputPassword name="password" id="password" required value={pwd} onChange={e => setPwd(e.target.value)} autoComplete="current-password" />
                                </div>

                                <Button type="submit" className="w-full" disabled={loading || secondaryActionLoading}>
                                    {loading ? t('SignIn.Submitting') : t('SignIn.Submit')}
                                </Button>

                                {showGuestOption ? (
                                    <Button
                                        type="button"
                                        className="w-full"
                                        variant="secondary"
                                        disabled={loading || secondaryActionLoading}
                                        onClick={() => {
                                            void onGuestContinue();
                                        }}
                                        data-testid="guest-sign-in"
                                    >
                                        {guestActionLoading ? t('SignIn.Submitting') : resumeAnonymousSession ? t('SignIn.Guest.ResumeAction') : t('SignIn.Guest.Action')}
                                    </Button>
                                ) : null}

                                {canShowDemoOption ? (
                                    <Button
                                        type="button"
                                        className="w-full"
                                        variant="secondary"
                                        disabled={loading || secondaryActionLoading}
                                        onClick={() => {
                                            void onDemoContinue();
                                        }}
                                        data-testid="demo-sign-in"
                                    >
                                        {demoActionLoading ? t('SignIn.Submitting') : t('SignIn.Demo.Action')}
                                    </Button>
                                ) : null}

                                <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                                    <span className="bg-background text-muted-foreground relative z-10 px-2">{t('SignIn.OrContinueWith')}</span>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <Button
                                        variant="outline"
                                        type="button"
                                        className="w-full"
                                        onClick={() => {
                                            void recoverAnonymousSessionIfNeeded().then(() => {
                                                signInViaGithub(callbackURL);
                                            }).catch((error: unknown) => {
                                                setErr(error instanceof Error ? error.message : t('SignIn.GithubStartFailed'));
                                            });
                                        }}
                                    >
                                        <IconBrandGithub size={30} />
                                        <span className="sr-only">{t('SignIn.LoginWithGithub')}</span>
                                    </Button>

                                    <Button
                                        variant="outline"
                                        type="button"
                                        className="w-full"
                                        onClick={() => {
                                            void recoverAnonymousSessionIfNeeded().then(() => {
                                                signInViaGoogle(callbackURL);
                                            }).catch((error: unknown) => {
                                                setErr(error instanceof Error ? error.message : t('SignIn.GoogleStartFailed'));
                                            });
                                        }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                            <path
                                                d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                                                fill="currentColor"
                                            />
                                        </svg>
                                        <span className="sr-only">{t('SignIn.LoginWithGoogle')}</span>
                                    </Button>
                                </div>

                                <div className="text-center text-sm">
                                    {t('SignIn.NoAccount')}{' '}
                                    {onRequestSignUp ? (
                                        <button type="button" className="underline underline-offset-4" onClick={onRequestSignUp}>
                                            {t('SignIn.SignUp')}
                                        </button>
                                    ) : (
                                        <Link href={`/sign-up?callbackURL=${encodeURIComponent(callbackURL)}`} className="underline underline-offset-4">
                                            {t('SignIn.SignUp')}
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                <div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
                    {t('SignIn.ContinueAgreement')} <a href="#">{t('SignIn.Terms')}</a> {t('SignIn.And')} <a href="#">{t('SignIn.Privacy')}</a>.
                </div>
            </div>
        </>
    );
}
