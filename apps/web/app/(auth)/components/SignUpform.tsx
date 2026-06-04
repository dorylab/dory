'use client';
import { Loader2 } from 'lucide-react';
import posthog from 'posthog-js';
import { cn } from '@dory/web-utils';
import { Label } from '@/registry/new-york-v4/ui/label';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Button } from '@/registry/new-york-v4/ui/button';
import Link from 'next/link';
import { authClient, signInViaGithub, signInViaGoogle } from '@/lib/auth-client';
import { useState } from 'react';
import { InputPassword } from '@/components/originui/input-password';
import { VerifyEmailPanel } from './verify-email-panel';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { useTranslations } from 'next-intl';
import { IconBrandGithub } from '@tabler/icons-react';
import { parseEnvFlag } from '@/lib/env';
import { env } from 'next-runtime-env';
import { getEmailVerificationCallbackURL } from '@/lib/client/auth-runtime';

type Stage = 'form' | 'verify';

type SignUpFormProps = React.ComponentProps<'div'> & {
    callbackURL?: string;
    onRequestSignIn?: () => void;
};

export function SignUpForm({ className, callbackURL: callbackURLOverride, onRequestSignIn, ...props }: SignUpFormProps) {
    const t = useTranslations('Auth');
    const requireEmailVerification = parseEnvFlag(env('NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION'));
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [stage, setStage] = useState<Stage>('form');
    const [emailForVerify, setEmailForVerify] = useState('');
    const verifyMatchRegex = new RegExp(t('SignUp.VerifyMatchPattern'), 'i');

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setErr(null);
        setLoading(true);

        try {
            const fd = new FormData(e.currentTarget);
            const email = String(fd.get('email') ?? '').trim();
            const password = String(fd.get('password') ?? '');
            const name = String(fd.get('name') ?? (email.split('@')[0] || ''));
            const callbackURL = getEmailVerificationCallbackURL(callbackURLOverride || '/');

            const { error } = await authClient.signUp.email(
                { name, email, password, callbackURL },
                {
                    onError(ctx) {
                        //The error message of better-auth is presented directly
                        setErr(ctx.error.message);
                    },
                },
            );

            // Only switch to verify panel after server confirms sign-up success.
            if (!error) {
                posthog.identify(email, { email, name });
                posthog.capture('user_signed_up', { method: 'email' });
                if (requireEmailVerification) {
                    setEmailForVerify(email);
                    setStage('verify');
                } else {
                    window.location.href = callbackURLOverride || '/';
                }
            } else {
                // Keep user on the form for regular errors (e.g. email already exists).
                // Only switch for "unverified account" type errors.
                if (verifyMatchRegex.test(error.message ?? '')) {
                    posthog.identify(email, { email, name });
                    posthog.capture('user_signed_up', { method: 'email' });
                    if (requireEmailVerification) {
                        setEmailForVerify(email);
                        setStage('verify');
                    }
                } else {
                    posthog.capture('user_sign_up_failed', { method: 'email', error: error.message });
                }
            }
        } finally {
            setLoading(false);
        }
    }

    if (stage === 'verify') {
        return (
            <div className={cn('mx-auto flex w-full max-w-2xl flex-col gap-6', className)} {...props}>
                <VerifyEmailPanel
                    className="max-w-2xl"
                    defaultEmail={emailForVerify}
                    callbackURL={callbackURLOverride || '/'}
                    onRequestSignIn={onRequestSignIn}
                    onChangeEmail={newEmail => {
                        //Return to the registration form and fill in the new email address
                        setStage('form');
                        setTimeout(() => {
                            const input = document.querySelector<HTMLInputElement>('input[name="email"]');
                            if (input) input.value = newEmail;
                        }, 0);
                    }}
                />
                <div className="text-center text-sm">
                    {t('SignUp.HasAccount')}{' '}
                    {onRequestSignIn ? (
                        <button type="button" className="underline underline-offset-4" onClick={onRequestSignIn}>
                            {t('SignUp.GoToSignIn')}
                        </button>
                    ) : (
                        <Link href={`/sign-in?callbackURL=${encodeURIComponent(callbackURLOverride || '/')}`} className="underline underline-offset-4">
                            {t('SignUp.GoToSignIn')}
                        </Link>
                    )}
                </div>
            </div>
        );
    }

    //--Original registration form
    return (
        <div className={cn('mx-auto flex min-w-0 w-full max-w-md flex-col gap-6', className)} {...props}>
            <Card className="overflow-hidden p-0">
                <CardContent className="grid p-0 md:grid-cols-1">
                    <form className="p-6 md:p-8" onSubmit={onSubmit} noValidate data-testid="sign-up-form">
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col items-center text-center">
                                <h1 className="text-2xl font-bold">{t('SignUp.Title')}</h1>
                            </div>

                            <div className="grid gap-3">
                                <Label htmlFor="name">{t('SignUp.Name')}</Label>
                                <Input id="name" name="name" type="text" placeholder={t('SignUp.NamePlaceholder')} autoComplete="name" />
                            </div>

                            <div className="grid gap-3">
                                <Label htmlFor="email">{t('SignUp.Email')}</Label>
                                <Input id="email" name="email" type="email" placeholder={t('SignUp.EmailPlaceholder')} autoComplete="email" required />
                            </div>

                            <div className="grid gap-3">
                                <Label htmlFor="password">{t('SignUp.Password')}</Label>
                                <InputPassword id="password" name="password" placeholder="" autoComplete="new-password" minLength={8} required />
                            </div>

                            {err ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{err}</div> : null}

                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? (
                                    <span className="inline-flex items-center gap-2">
                                        <Loader2 className="size-4 animate-spin" />
                                        {t('SignUp.Submitting')}
                                    </span>
                                ) : (
                                    t('SignUp.Submit')
                                )}
                            </Button>

                            <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                                <span className="bg-background text-muted-foreground relative z-10 px-2">{t('SignUp.Or')}</span>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <Button
                                    variant="outline"
                                    type="button"
                                    className="w-full"
                                    onClick={() => {
                                        if (window.authBridge?.openExternal) {
                                            // void signInViaGithubElectron();
                                        } else {
                                            signInViaGithub(callbackURLOverride || '/');
                                        }
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
                                        if (window.authBridge?.openExternal) {
                                            // TODO: add Electron Google OAuth when needed
                                            return;
                                        }
                                        signInViaGoogle(callbackURLOverride || '/');
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
                                {t('SignUp.AlreadyHaveAccount')}{' '}
                                {onRequestSignIn ? (
                                    <button type="button" className="underline underline-offset-4" onClick={onRequestSignIn}>
                                        {t('SignUp.SignIn')}
                                    </button>
                                ) : (
                                    <Link href={`/sign-in?callbackURL=${encodeURIComponent(callbackURLOverride || '/')}`} className="underline underline-offset-4">
                                        {t('SignUp.SignIn')}
                                    </Link>
                                )}
                            </div>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
                {t('SignUp.ContinueAgreement')} <a href="#">{t('SignUp.Terms')}</a> {t('SignUp.And')} <a href="#">{t('SignUp.Privacy')}</a>.
            </div>
        </div>
    );
}
