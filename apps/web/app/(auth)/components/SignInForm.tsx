'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';
import { IconBrandGithub } from '@tabler/icons-react';
import { authClient, signInViaGithub } from '@/lib/auth-client'; //Introducing authClient
import { InputPassword } from '@/components/originui/input-password';
import { authFetch } from '@/lib/client/auth-fetch';
import { setAuthToken } from '@/lib/client/auth-token';
import { useTranslations } from 'next-intl';

export function SignInForm({ className, imageUrl, ...props }: React.ComponentProps<'div'> & { imageUrl?: string }) {
    const t = useTranslations('Auth');
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [demoLoading, setDemoLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [pwd, setPwd] = useState('');
    const [err, setErr] = useState<string | null>(null);
    const [msg, setMsg] = useState<string | null>(null);

    function decodeJwtPayload(token: string): Record<string, unknown> | null {
        try {
            const payloadBase64 = token.split('.')[1];
            if (!payloadBase64) return null;
            const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
            const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
            const json = atob(padded);
            return JSON.parse(json) as Record<string, unknown>;
        } catch (error) {
            console.warn('[auth] failed to decode jwt payload', error);
            return null;
        }
    }

    useEffect(() => {
        if (!window.authBridge?.onCallback) return;
        const unsubscribe = window.authBridge.onCallback(async deepLink => {
            try {
                const url = new URL(deepLink);
                const token = url.searchParams.get('token');
                const error = url.searchParams.get('error');

                if (error) {
                    setErr(t('SignIn.AuthFailed', { error }));
                    return;
                }

                if (!token) {
                    setErr(t('SignIn.MissingToken'));
                    return;
                }

                await setAuthToken(token);
                setMsg(t('SignIn.SuccessRefreshing'));
                const payload = decodeJwtPayload(token);
                const defaultTeamId = typeof payload?.defaultTeamId === 'string' ? payload.defaultTeamId : null;
                router.refresh();
                if (defaultTeamId) {
                    router.replace(`/${defaultTeamId}/connections`);
                } else {
                    router.push(`/${defaultTeamId}/connections`);
                }
            } catch (e) {
                setErr(t('SignIn.InvalidCallback'));
            }
        });

        return () => {
            unsubscribe?.();
        };
    }, [router]);

    async function signInViaGithubElectron() {
        setErr(null);
        setMsg(null);
        try {
            const res = await authFetch('/api/electron/auth/start/github?redirectTo=dory://auth/callback', {
                method: 'GET',
            });
            console.log('GitHub OAuth start response:', res);
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.url) {
                throw new Error(data?.message || t('SignIn.GithubStartFailed'));
            }
            await window.authBridge?.openExternal(data.url);
        } catch (e: any) {
            setErr(e?.message ?? t('SignIn.GithubStartFailed'));
        }
    }

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setErr(null);
        setMsg(null);
        setLoading(true);
        try {
            const { error } = await authClient.signIn.email({
                email,
                password: pwd,
                //Jump after logging in (can be modified as needed)
                callbackURL: `/`,
                //You can also add rememberMe: true
            });
            if (error) {
                setErr(error.message ?? t('SignIn.LoginFailedRetry'));
            } else {
                //Success: Better Auth will handle the callback; for SSR/CSR consistency, it will also perform a local jump.
                router.push(`/`);
            }
        } catch (e: any) {
            setErr(e?.message ?? t('SignIn.NetworkErrorRetry'));
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
            const { error } = await authClient.requestPasswordReset({
                email,
                //After the link opens, it jumps to your reset password page (this page completes resetPassword from the token in the URL)
                redirectTo: `${window.location.origin}/reset-password`,
            });
            if (error) {
                setErr(error.message ?? t('SignIn.ResetEmailFailed'));
            } else {
                setMsg(t('SignIn.ResetEmailSent'));
            }
        } catch (e: any) {
            setErr(e?.message ?? t('SignIn.SendFailedRetry'));
        } finally {
            setLoading(false);
        }
    }

    async function onDemoSignIn() {
        setErr(null);
        setMsg(null);
        setDemoLoading(true);
        try {
            const res = await fetch('/api/auth/demo', { method: 'POST' });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.message ?? t('SignIn.LoginFailedRetry'));
            }
            router.refresh();
            router.push(`/`);
        } catch (e: any) {
            setErr(e?.message ?? t('SignIn.NetworkErrorRetry'));
        } finally {
            setDemoLoading(false);
        }
    }

    return (
        <div className={cn('flex flex-col gap-6', className)} {...props}>
            <Card className="overflow-hidden p-0">
                <CardContent className="grid p-0 md:grid-cols-1">
                    <form className="p-6 md:p-8" onSubmit={onSubmit}>
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col items-center text-center">
                                <h1 className="text-2xl font-bold">{t('SignIn.Title')}</h1>
                                <p className="text-muted-foreground text-balance">{t('SignIn.Description')}</p>
                            </div>

                            {err ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{err}</div> : null}
                            {msg ? <div className="rounded-md border border-emerald-300/40 bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div> : null}

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

                            <Button type="submit" className="w-full" disabled={loading || demoLoading}>
                                {loading ? t('SignIn.Submitting') : t('SignIn.Submit')}
                            </Button>

                            <Button type="button" className="w-full" variant="secondary" disabled={loading || demoLoading} onClick={onDemoSignIn}>
                                {demoLoading ? t('SignIn.Submitting') : t('SignIn.DemoEnter')}
                            </Button>

                            <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                                <span className="bg-background text-muted-foreground relative z-10 px-2">{t('SignIn.OrContinueWith')}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <Button
                                    variant="outline"
                                    type="button"
                                    className="w-full"
                                    onClick={() => {
                                        if (window.authBridge?.openExternal) {
                                            void signInViaGithubElectron();
                                        } else {
                                            signInViaGithub();
                                        }
                                    }}
                                >
                                    <IconBrandGithub size={30} />
                                    <span className="sr-only">{t('SignIn.LoginWithGithub')}</span>
                                </Button>

                                <Button variant="outline" type="button" className="w-full" disabled>
                                    {/* Google placeholder: connect socialProviders.google on demand*/}
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
                                <Link href="/sign-up" className="underline underline-offset-4">
                                    {t('SignIn.SignUp')}
                                </Link>
                            </div>
                        </div>
                    </form>
{/* 
                    <div className="bg-primary/50 relative hidden md:block">
                        {imageUrl && <Image fill src={imageUrl} alt="Image" className="absolute inset-0 h-full w-full object-cover" />}
                    </div> */}
                </CardContent>
            </Card>

            <div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
                {t('SignIn.ContinueAgreement')}{' '}
                <a href="#">{t('SignIn.Terms')}</a> {t('SignIn.And')}{' '}
                <a href="#">{t('SignIn.Privacy')}</a>.
            </div>
        </div>
    );
}
