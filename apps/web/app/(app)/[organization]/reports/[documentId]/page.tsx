import { WorkReport } from '@/components/work-documents/work-report';
export default async function Page({ params }: { params: Promise<{ documentId: string }> }) {
    return <WorkReport documentId={(await params).documentId} />;
}
