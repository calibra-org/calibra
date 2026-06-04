import { cn } from "#/lib/utils";

export type PillTone = "success" | "warning" | "danger" | "neutral" | "info";

/**
 * Tinted surface + tone-coloured text (NOT `*-foreground`, which is the near-black/white meant for
 * a *solid* tone fill and goes invisible on a translucent one). A solid dot makes the tone read
 * instantly in both light + dark. Mirrors the admin `StatusBadge`.
 */
const SURFACE: Record<PillTone, string> = {
    neutral: "bg-muted/70 text-foreground/80 ring-border",
    info: "bg-info/12 text-info ring-info/25",
    success: "bg-success/12 text-success ring-success/25",
    warning: "bg-warning/15 text-warning ring-warning/30",
    danger: "bg-danger/12 text-danger ring-danger/25",
};

const DOT: Record<PillTone, string> = {
    neutral: "bg-muted-foreground",
    info: "bg-info",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
};

/** Tone-coloured status pill with a dot (shop status, TLS status, plan tier). */
export function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-medium text-xs ring-1 ring-inset",
                SURFACE[tone],
            )}
        >
            <span className={cn("size-1.5 shrink-0 rounded-full", DOT[tone])} aria-hidden="true" />
            <span>{children}</span>
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
