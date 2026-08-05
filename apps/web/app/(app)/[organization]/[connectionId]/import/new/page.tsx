import { ImportWizard } from '../../../import/import-wizard.client';
import { getImportConfig } from '@/lib/server/imports/config';

export default function NewImportPage() {
    return <ImportWizard maxFileBytes={getImportConfig().maxFileBytes} />;
}
