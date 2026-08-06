import { ImportWizard } from '../../../import/import-wizard.client';
import { getImportConfig } from '@/lib/server/imports/config';

export default async function ImportRunPage({ params }: { params: Promise<{ runId: string }> }) {
    return <ImportWizard runId={(await params).runId} maxFileBytes={getImportConfig().maxFileBytes} />;
}
