import ReportWorkspacePage from '@/components/work-documents/report-workspace-page';

export default function InterceptedReportWorkspace(props: Parameters<typeof ReportWorkspacePage>[0]) {
    return <ReportWorkspacePage {...props} intercepted />;
}
