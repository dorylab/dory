import { ChartNoAxesCombined, File, FileText, Table2 } from 'lucide-react';
import type { ReferenceOption } from '@/lib/chat-context/mentions';

export function ResourceIcon({ reference, artifactType }: Pick<ReferenceOption, 'reference' | 'artifactType'>) {
    const Icon = reference.kind === 'table' ? Table2 : reference.kind === 'report' ? FileText : artifactType === 'file' ? File : ChartNoAxesCombined;
    return <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}
