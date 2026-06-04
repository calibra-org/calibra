import { cn } from "#/lib/utils";

export type PillTone = "success" | "warning" | "danger" | "neutral" | "info";

const TONE: Record<PillTone, string> = {
    success: "bg-success/10 text-success-foreground ring-success/30",
    warning: "bg-warning/15 text-warning-foreground ring-warning/30",
    danger: "bg-danger/10 text-danger ring-danger/30",
    info: "bg-info/10 text-info-foreground ring-info/30",
    neutral: "bg-muted text-muted-foreground ring-border",
};

/** Tone-coloured status pill (shop status, TLS status, plan tier). */
export function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs ring-1 ring-inset",
                TONE[tone],
            )}
        >
            {children}
        </span>
    );
}

/** Map a tenant lifecycle status to a pill tone. */
export function tenantStatusTone(status: string): PillTone {
    if (status === "active") return "success";
    if (status === "suspended") return "warning";
    return "neutral";
}

/** Map a domain TLS status to a pill tone. */
export function tlsStatusTone(status: string): PillTone {
    if (status === "active") return "success";
    if (status === "failed") return "danger";
    return "warning";
}
