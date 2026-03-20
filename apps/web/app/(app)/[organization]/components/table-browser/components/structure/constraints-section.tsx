'use client';

import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { useTranslations } from 'next-intl';

export type TableConstraint = {
    type: 'Unique' | 'Check' | 'Materialized' | 'Alias' | string;
    name?: string | null;
    expression?: string | null;
};

type ConstraintsSectionProps = {
    constraints: TableConstraint[];
};

export function ConstraintsSection({ constraints }: ConstraintsSectionProps) {
    const hasConstraints = constraints.length > 0;
    const t = useTranslations('TableBrowser');

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-medium">{t('Constraints')}</h3>
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{t('Defined constraints')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {hasConstraints ? (
                        constraints.map((c, idx) => (
                            <div key={`${c.type}-${c.name ?? idx}`} className="flex gap-3 items-start">
                                <Badge variant="outline" className="text-xs mt-0.5">
                                    {c.type}
                                </Badge>
                                <div className="space-y-1">
                                    <div className="text-sm font-medium">{c.name ?? t('Unnamed constraint')}</div>
                                    {c.expression ? (
                                        <div className="text-xs text-muted-foreground whitespace-pre-wrap">{c.expression}</div>
                                    ) : (
                                        <div className="text-xs text-muted-foreground">{t('No expression provided')}</div>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-sm text-muted-foreground">{t('No constraints found')}</div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
