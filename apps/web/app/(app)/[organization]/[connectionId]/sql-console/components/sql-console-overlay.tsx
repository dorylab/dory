export const SQL_CONSOLE_OVERLAY_ID = 'sql-console-overlay';

interface SqlConsoleOverlayHostProps {
    topOffset: number;
}

export function SqlConsoleOverlayHost({ topOffset }: SqlConsoleOverlayHostProps) {
    return <div id={SQL_CONSOLE_OVERLAY_ID} className="pointer-events-none absolute inset-x-0 bottom-0 z-30" style={{ top: topOffset }} />;
}
