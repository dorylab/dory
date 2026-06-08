import { redirect } from 'next/navigation';

export default async function WorkPage({ params }: { params: Promise<{ organization: string }> }) {
    const { organization } = await params;
    redirect(`/${organization}/works`);
}
