import { cn } from "@calibra/shared";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const tones: Record<StatusTone, string> = {
    neutral: "bg-muted text-muted-foreground",
    info: "bg-sky-500/10 text-sky-600",
    success: "bg-emerald-500/10 text-emerald-600",
    warning: "bg-amber-500/10 text-amber-700",
    danger: "bg-rose-500/10 text-rose-600",
};

interface StatusBadgeProps {
    tone: StatusTone;
    children: React.ReactNode;
}

export function StatusBadge({ tone, children }: StatusBadgeProps) {
    return (
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs", tones[tone])}>
            {children}
        </span>
    );
}
