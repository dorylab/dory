import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';

import SqlConsoleLayout from '@/app/(app)/[organization]/[connectionId]/sql-console/layout';
import { getImportConfig } from '@/lib/server/imports/config';
import { ArtifactWorkspaceDrawerContent } from './artifact-workspace-drawer-content';
import { ArtifactWorkspaceDrawer } from './artifact-workspace-drawer';

export async function ArtifactWorkspaceDrawerPage({ organization, artifactId, connectionId }: { organization: string; artifactId: string; connectionId: string }) {
    const t = await getTranslations('Artifacts.WorkspaceDrawer');
    const layout = (await cookies()).get('react-resizable-panels:layout');
    let defaultLayout: number[] | undefined;
    if (layout) {
        try {
            defaultLayout = JSON.parse(layout.value) as number[];
        } catch {
            defaultLayout = undefined;
        }
    }

    return (
        <ArtifactWorkspaceDrawer artifactId={artifactId} organization={organization} title={t('Title')} description={t('Description')} closeLabel={t('Close')}>
            <SqlConsoleLayout>
                <ArtifactWorkspaceDrawerContent
                    artifactId={artifactId}
                    connectionId={connectionId}
                    organization={organization}
                    defaultLayout={defaultLayout}
                    maxFileBytes={getImportConfig().maxFileBytes}
                />
            </SqlConsoleLayout>
        </ArtifactWorkspaceDrawer>
    );
}
