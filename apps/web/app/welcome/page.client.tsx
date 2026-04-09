'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { HeroBackground } from '../(auth)/components/bg';

type WelcomePageClientProps = {
    resumeAnonymousSession?: boolean;
};

export default function WelcomePageClient({ resumeAnonymousSession = false }: WelcomePageClientProps) {
    const t = useTranslations('Welcome');
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleStart() {
        setError(null);
        setLoading(true);

        try {
            if (resumeAnonymousSession) {
                const recoverResponse = await fetch('/api/auth/anonymous/recover', {
                    method: 'POST',
                    credentials: 'include',
                });

                if (!recoverResponse.ok) {
                    const payload = await recoverResponse.json().catch(() => null);
                    throw new Error(typeof payload?.error === 'string' ? payload.error : t('Errors.StartFailed'));
                }
            } else {
                const result = await authClient.signIn.anonymous();
                if (result?.error) {
                    throw new Error(result.error.message || t('Errors.StartFailed'));
                }
            }

            const response = await fetch('/api/auth/anonymous/bootstrap', {
                method: 'POST',
                credentials: 'include',
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok || !payload?.organizationSlug) {
                throw new Error(typeof payload?.error === 'string' ? payload.error : t('Errors.StartFailed'));
            }

            router.refresh();
            router.push(`/${payload.organizationSlug}/connections`);
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : t('Errors.StartFailed'));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-10">
            <HeroBackground className="absolute inset-0" />
            <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-8 lg:flex-row">
                <div className="flex flex-1 flex-col justify-center gap-6 text-white">
                    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm backdrop-blur">
                        <Sparkles className="h-4 w-4" />
                        {t('Badge')}
                    </div>
                    <div className="space-y-4">
                        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">{t('Title')}</h1>
                        <p className="max-w-2xl text-base text-white/70 sm:text-lg">{t('Description')}</p>
                    </div>
                    <div className="grid max-w-2xl gap-3 text-sm text-white/70 sm:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">{t('Highlights.Instant')}</div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">{t('Highlights.Private')}</div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">{t('Highlights.Upgrade')}</div>
                    </div>
                </div>

                <Card className="w-full max-w-md border-white/10 bg-background/90 backdrop-blur">
                    <CardHeader>
                        <CardTitle>{t('CardTitle')}</CardTitle>
                        <CardDescription>{t('CardDescription')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
                        <Button className="w-full" size="lg" disabled={loading} onClick={handleStart}>
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t('Starting')}
                                </>
                            ) : (
                                <>
                                    {resumeAnonymousSession ? t('Resume') : t('Start')}
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </>
                            )}
                        </Button>
                        <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">{t('Hint')}</div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{t('HaveAccount')}</span>
                            <Link href="/sign-in?callbackURL=%2F" className="font-medium underline underline-offset-4">
                                {t('SignIn')}
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
