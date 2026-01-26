'use client';
import { GalleryVerticalEnd, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/registry/new-york-v4/ui/label';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Button } from '@/registry/new-york-v4/ui/button';
import Link from 'next/link';
import { authClient, signInViaGithub } from '@/lib/auth-client';
import { useState } from 'react';
import { InputPassword } from '@/components/originui/input-password';
import { VerifyEmailPanel } from './verify-email-panel';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { useTranslations } from 'next-intl';
import { IconBrandGithub } from '@tabler/icons-react';

type Stage = 'form' | 'verify';

export function SignUpForm({ className, ...props }: React.ComponentProps<'div'>) {
    const t = useTranslations('Auth');
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

            const { error } = await authClient.signUp.email(
                { name, email, password, callbackURL: '/' },
                {
                    onError(ctx) {
                        //The error message of better-auth is presented directly
                        setErr(ctx.error.message);
                    },
                },
            );

            //Regardless of whether the email is actually delivered, the user is directed to "verify email"
            if (!error) {
                setEmailForVerify(email);
                setStage('verify');
            } else {
                //Common: the email address has been occupied; it may also be "unverified existing account"
                //You can also enter the verify panel here, and users can use "Resend" to complete the verification.
                if (verifyMatchRegex.test(error.message ?? '')) {
                    setEmailForVerify(email);
                    setStage('verify');
                }
            }
        } finally {
            setLoading(false);
        }
    }

    if (stage === 'verify') {
        return (
            <div className={cn('flex flex-col gap-6', className)} {...props}>
                <VerifyEmailPanel
                    defaultEmail={emailForVerify}
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
                    <Link href="/sign-in" className="underline underline-offset-4">
                        {t('SignUp.GoToSignIn')}
                    </Link>
                </div>
            </div>
        );
    }

    //--Original registration form
    return (
        <div className={cn('flex flex-col gap-6', className)} {...props}>
            <Card className="overflow-hidden">
                <CardContent className="flex md:grid-cols-2 justify-center">
                    <form onSubmit={onSubmit} noValidate>
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col items-center gap-2">
                                <a href="#" className="flex flex-col items-center gap-2 font-medium">
                                    <div className="flex size-8 items-center justify-center rounded-md">
                                        <GalleryVerticalEnd className="size-6" />
                                    </div>
                                    <span className="sr-only">{t('SignUp.BrandName')}</span>
                                </a>
                                <h1 className="text-xl font-bold">{t('SignUp.Title')}</h1>
                                <div className="text-center text-sm">
                                    {t('SignUp.AlreadyHaveAccount')}{' '}
                                    <Link href="/sign-in" className="underline underline-offset-4">
                                        {t('SignUp.SignIn')}
                                    </Link>
                                </div>
                            </div>

                            <div className="flex flex-col gap-6">
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

                                {err && (
                                    <p className="text-sm text-red-500" aria-live="polite">
                                        {err}
                                    </p>
                                )}

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
                            </div>

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
                        </div>
                    </form>
                </CardContent>
            </Card>

            <div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
                {t('SignUp.ContinueAgreement')}{' '}
                <a href="#">{t('SignUp.Terms')}</a> {t('SignUp.And')}{' '}
                <a href="#">{t('SignUp.Privacy')}</a>.
            </div>
        </div>
    );
}
