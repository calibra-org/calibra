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
    info: "bg-sky-500/12 text-sky-700 ring-sky-500/25 dark:text-sky-300 dark:bg-sky-500/15",
    success: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300 dark:bg-emerald-500/15",
    warning: "bg-amber-500/15 text-amber-800 ring-amber-500/30 dark:text-amber-300 dark:bg-amber-500/15",
    danger: "bg-rose-500/12 text-rose-700 ring-rose-500/25 dark:text-rose-300 dark:bg-rose-500/15",
};

const dot: Record<StatusTone, string> = {
    neutral: "bg-muted-foreground",
    info: "bg-sky-500",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
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
