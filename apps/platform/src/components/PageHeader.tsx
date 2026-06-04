import type { ReactNode } from "react";

/** Standard view header: title + optional description on the start, actions on the end. */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
    return (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
                <h1 className="font-semibold text-xl leading-tight">{title}</h1>
                {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
            </div>
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
    );
}
