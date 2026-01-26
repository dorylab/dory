type MetricItemProps = {
    label: string;
    value: string;
    hint?: string;
};

export default function MetricItem({ label, value, hint }: MetricItemProps) {
    return (
        <div className="space-y-1">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-sm font-medium leading-tight">{value}</div>
            {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
        </div>
    );
}
