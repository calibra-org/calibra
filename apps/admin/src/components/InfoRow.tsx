import type { ReactNode } from "react";

interface InfoRowProps {
    label: ReactNode;
    value: ReactNode;
}

/** Two-column key/value row used inside detail panels. */
export function InfoRow({ label, value }: InfoRowProps) {
    return (
        <div className="flex items-start justify-between gap-4 border-border border-b py-2 last:border-b-0">
            <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
            <span className="text-end text-sm">{value}</span>
        </div>
    );
}
