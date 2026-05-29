import { redirect } from 'next/navigation';

export default async function OrganizationAuditPage({ params }: { params: Promise<{ organization: string }> }) {
    const { organization } = await params;
    redirect(`/${organization}/audit/logs`);
}
