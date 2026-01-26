export function PanelHeader({ title, description }: { title: string; description?: string }) {
    return (
        <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
    );
}
