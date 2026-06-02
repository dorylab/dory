import { redirect } from 'next/navigation';

import { getAppBootstrapState } from '@/lib/server/app-bootstrap';
import { canManageOrganization, resolveOrganizationAccess } from '@/lib/server/authz';
import { canUseQueryAuditForOrganization } from '@/lib/server/query-audit/entitlement';
import QueryAuditPageClient from './page.client';

export default async function OrganizationQueryAuditPage({ params }: { params: Promise<{ organization: string }> }) {
    const { organization } = await params;
    const bootstrap = await getAppBootstrapState({ organizationSlugOrId: organization });
    const userId = bootstrap.session?.user?.id ?? null;
    const organizationId = bootstrap.organization?.id ?? bootstrap.activeOrganizationId;

    if (!userId || !organizationId) {
        redirect('/sign-in');
    }

    const access = await resolveOrganizationAccess(organizationId, userId);
    if (!canManageOrganization(access)) {
        redirect(`/${organization}/connections`);
    }

    if (!(await canUseQueryAuditForOrganization(organizationId))) {
        redirect(`/${organization}/connections`);
    }

    return <QueryAuditPageClient organizationId={organizationId} />;
}
