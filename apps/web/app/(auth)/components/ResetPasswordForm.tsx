'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Label } from '@/registry/new-york-v4/ui/label';
import { InputPassword } from '@/components/originui/input-password';
import { authFetch } from '@/lib/client/auth-fetch';
import { useTranslations } from 'next-intl';
import { cn } from '@dory/web-utils';

export function ResetPasswordForm({ className, ...props }: React.ComponentProps<'div'>) {
    const t = useTranslations('Auth');
    const router = useRouter();
    const searchParams = useSearchParams();
    const [pwd, setPwd] = useState('');
    const [confirmPwd, setConfirmPwd] = useState('');
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [msg, setMsg] = useState<string | null>(null);

    const token = useMemo(() => {
        const fromQuery = searchParams?.get('token');
        return fromQuery?.trim() || '';
    }, [searchParams]);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setErr(null);
        setMsg(null);

        if (!token) {
            setErr(t('ResetPassword.MissingToken'));
            return;
        }

        if (!pwd || !confirmPwd) {
            setErr(t('ResetPassword.PasswordRequired'));
            return;
        }

        if (pwd !== confirmPwd) {
            setErr(t('ResetPassword.PasswordMismatch'));
            return;
        }

        setLoading(true);
        try {
            const url = `/api/auth/reset-password?token=${encodeURIComponent(token)}`;
            const res = await authFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPassword: pwd, token }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => null);
                setErr(data?.message || t('ResetPassword.Failed'));
                return;
            }

            setMsg(t('ResetPassword.Success'));
            setPwd('');
            setConfirmPwd('');
            setTimeout(() => {
                router.replace('/sign-in');
            }, 800);
        } catch (e: any) {
            setErr(e?.message || t('ResetPassword.NetworkError'));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className={cn('flex flex-col gap-6', className)} {...props}>
            <Card className="overflow-hidden p-0">
                <CardContent className="grid p-0 md:grid-cols-1">
                    <form className="p-6 md:p-8" onSubmit={onSubmit}>
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col items-center text-center">
                                <h1 className="text-2xl font-bold">{t('ResetPassword.Title')}</h1>
                                <p className="text-muted-foreground text-balance">{t('ResetPassword.Description')}</p>
                            </div>

                            {err ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{err}</div> : null}
                            {msg ? <div className="rounded-md border border-emerald-300/40 bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div> : null}

                            {!token ? (
                                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                                    {t('ResetPassword.InvalidLink')}
                                </div>
                            ) : null}

                            <div className="grid gap-3">
                                <Label htmlFor="new-password">{t('ResetPassword.NewPassword')}</Label>
                                <InputPassword
                                    id="new-password"
                                    name="new-password"
                                    required
                                    value={pwd}
                                    onChange={e => setPwd(e.target.value)}
                                    autoComplete="new-password"
                                />
                            </div>

                            <div className="grid gap-3">
                                <Label htmlFor="confirm-password">{t('ResetPassword.ConfirmPassword')}</Label>
                                <InputPassword
                                    id="confirm-password"
                                    name="confirm-password"
                                    required
                                    value={confirmPwd}
                                    onChange={e => setConfirmPwd(e.target.value)}
                                    autoComplete="new-password"
                                />
                            </div>

                            <Button type="submit" className="w-full" disabled={loading || !token}>
                                {loading ? t('ResetPassword.Submitting') : t('ResetPassword.Submit')}
                            </Button>

                            <div className="text-center text-sm">
                                <Link href="/sign-in" className="underline underline-offset-4">
                                    {t('ResetPassword.GoToSignIn')}
                                </Link>
                            </div>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
