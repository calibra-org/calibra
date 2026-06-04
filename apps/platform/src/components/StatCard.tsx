import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

/** Dense KPI tile for the console — label, value, optional icon + sublabel. Ops-flavoured: flat, neutral. */
export function StatCard({
    label,
    value,
    sublabel,
    icon: Icon,
    className,
}: {
    label: string;
    value: ReactNode;
    sublabel?: ReactNode;
    icon?: LucideIcon;
    className?: string;
}) {
    return (
        <div className={cn("flex flex-col gap-1 rounded-lg border border-border bg-card p-4", className)}>
            <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
                {Icon ? <Icon className="size-4 text-muted-foreground" aria-hidden="true" /> : null}
            </div>
            <span className="font-semibold text-2xl tabular-nums leading-tight">{value}</span>
            {sublabel ? <span className="text-muted-foreground text-xs">{sublabel}</span> : null}
        </div>
    );
}
