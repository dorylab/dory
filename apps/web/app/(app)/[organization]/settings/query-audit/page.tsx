import { redirect } from 'next/navigation';

import { getAppBootstrapState } from '@/lib/server/app-bootstrap';
import { canManageOrganization, resolveOrganizationAccess } from '@/lib/server/authz';
import QueryAuditPageClient from '../../query-audit/page.client';

export default async function OrganizationSettingsQueryAuditPage({ params }: { params: Promise<{ organization: string }> }) {
    const { organization } = await params;
    const bootstrap = await getAppBootstrapState({ organizationSlugOrId: organization });
    const userId = bootstrap.session?.user?.id ?? null;
    const organizationId = bootstrap.organization?.id ?? bootstrap.activeOrganizationId;

    if (!userId || !organizationId) {
        redirect('/sign-in');
    }

    const access = await resolveOrganizationAccess(organizationId, userId);
    if (!canManageOrganization(access)) {
        redirect(`/${organization}/settings/organization`);
    }

    return <QueryAuditPageClient organizationId={organizationId} showHeader={false} embedded />;
}
