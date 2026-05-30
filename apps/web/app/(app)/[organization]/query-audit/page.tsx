import { redirect } from 'next/navigation';

export default async function OrganizationQueryAuditPage({ params }: { params: Promise<{ organization: string }> }) {
    const { organization } = await params;
    redirect(`/${organization}/settings/query-audit`);
}
