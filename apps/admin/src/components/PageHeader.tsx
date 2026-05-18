import type { ReactNode } from "react";

interface PageHeaderProps {
    title: ReactNode;
    subtitle?: ReactNode;
    actions?: ReactNode;
}

/** Page chrome used at the top of every authenticated page. Keeps the visual rhythm consistent. */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
    return (
        <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
                <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
                {subtitle !== undefined && <p className="text-muted-foreground text-sm">{subtitle}</p>}
            </div>
            {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
    );
}
