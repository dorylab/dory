import type { FindingPresentation } from '@dory/database/postgres/schemas/findings';

import { Badge } from '@/registry/new-york-v4/ui/badge';

/** Identify the old replay's display format only; never interpret its data or generate a conclusion. */
export function isLegacyFindingData(content: string) {
    const lines = content.trim().split(/\r?\n/);
    return lines.length > 0 && lines.every(line => /^[a-z_]+ = [^;=\r\n]+(?:; [a-z_]+ = [^;=\r\n]+)+$/.test(line));
}

export function FindingDetails({
    content,
    presentation,
    labels,
}: {
    content: string | null;
    presentation: FindingPresentation | null;
    labels: { legacyData: string; legacyDescription: string };
}) {
    const legacyData = !presentation && content && isLegacyFindingData(content);

    return (
        <>
            {content ? (
                legacyData ? (
                    <div className="mt-4 grid min-w-0 gap-3">
                        <p className="text-sm leading-6 text-muted-foreground">{labels.legacyDescription}</p>
                        <details className="min-w-0 rounded-md border bg-muted/30 px-3 py-2">
                            <summary className="cursor-pointer text-sm font-medium outline-offset-4 focus-visible:outline focus-visible:outline-ring">{labels.legacyData}</summary>
                            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words border-t pt-3 font-mono text-xs leading-6 text-muted-foreground">
                                {content}
                            </pre>
                        </details>
                    </div>
                ) : (
                    <p className="mt-4 whitespace-pre-line break-words text-sm leading-6">{content}</p>
                )
            ) : null}
            {presentation?.timeframe ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{presentation.timeframe}</p> : null}
            {presentation?.dimensions?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                    {presentation.dimensions.map(dimension => (
                        <Badge key={dimension} variant="secondary">
                            {dimension}
                        </Badge>
                    ))}
                </div>
            ) : null}
            {presentation?.facts?.length ? (
                <dl className="mt-5 grid min-w-0 gap-3 sm:grid-cols-3">
                    {presentation.facts.map((fact, index) => (
                        <div key={`${index}-${fact.label}`} className="min-w-0 rounded-md border bg-muted/30 px-3 py-3">
                            <dt className="break-words text-xs leading-5 text-muted-foreground">{fact.label}</dt>
                            <dd className="mt-1 break-words text-lg font-semibold tabular-nums">{fact.value}</dd>
                        </div>
                    ))}
                </dl>
            ) : null}
        </>
    );
}
