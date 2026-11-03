import type { ComponentProps } from 'react';

import ReportWorkspacePage from '@/components/work-documents/report-workspace-page';

export default function Page(props: ComponentProps<typeof ReportWorkspacePage>) {
    return <ReportWorkspacePage {...props} intercepted />;
}
