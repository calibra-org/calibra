import { cn } from "@calibra/shared";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

/**
 * Linear-style status pill: a small filled dot indicator plus tone-coloured text on a tinted
 * background. Higher contrast than a single text color on transparent — the dot reads instantly
 * across both modes and disambiguates statuses for colour-vision-impaired operators when paired
 * with the label.
 */
const surface: Record<StatusTone, string> = {
    neutral: "bg-muted/70 text-foreground/80 ring-border",
    info: "bg-info/12 text-info ring-info/25 dark:text-info dark:bg-info/15",
    success: "bg-success/12 text-success ring-success/25 dark:text-success dark:bg-success/15",
    warning: "bg-warning/15 text-warning ring-warning/30 dark:text-warning dark:bg-warning/15",
    danger: "bg-danger/12 text-danger ring-danger/25 dark:text-danger dark:bg-danger/15",
};

const dot: Record<StatusTone, string> = {
    neutral: "bg-muted-foreground",
    info: "bg-info",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
};

interface StatusBadgeProps {
    tone: StatusTone;
    children: React.ReactNode;
}

export function StatusBadge({ tone, children }: StatusBadgeProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-medium text-xs ring-1 ring-inset",
                surface[tone],
            )}
        >
            <span className={cn("size-1.5 shrink-0 rounded-full", dot[tone])} aria-hidden="true" />
            <span>{children}</span>
        </span>
    );
}
