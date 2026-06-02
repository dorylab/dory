import { redirect } from 'next/navigation';

export default async function OrganizationSettingsQueryAuditPage({ params }: { params: Promise<{ organization: string }> }) {
    const { organization } = await params;
    redirect(`/${organization}/query-audit`);
}
