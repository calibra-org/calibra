"use client";

import { AlertTriangle, ShieldAlert, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "#/components/ui/hover-card";
import type { OrderRiskFlag } from "#/lib/types";
import { cn } from "#/lib/utils";

const ICONS: Record<string, typeof AlertTriangle> = {
    high_value: Wallet,
    shipping_mismatch: ShieldAlert,
    failed_payment: AlertTriangle,
};

const TONES: Record<string, string> = {
    high_value: "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300",
    shipping_mismatch: "bg-rose-500/12 text-rose-700 ring-rose-500/25 dark:text-rose-300",
    failed_payment: "bg-rose-500/12 text-rose-700 ring-rose-500/25 dark:text-rose-300",
};

interface RiskFlagChipProps {
    flag: OrderRiskFlag;
}

/**
 * Single-flag chip — icon-only by default with a hover-card description so the row stays compact.
 * The label and tooltip come from the `Orders.riskFlags.*` namespace; unknown flags fall back to a
 * neutral chip with the raw flag identifier so the surface degrades cleanly when a new flag ships
 * before the translation does.
 */
export function RiskFlagChip({ flag }: RiskFlagChipProps) {
    const t = useTranslations("Orders.list.riskFlags");
    const Icon = ICONS[flag] ?? AlertTriangle;
    const tone = TONES[flag] ?? "bg-muted text-foreground ring-border";
    const labelKey = `${flag}.label` as never;
    const descriptionKey = `${flag}.description` as never;
    const label = safeT(t, labelKey, flag);
    const description = safeT(t, descriptionKey, label);
    return (
        <HoverCard>
            <HoverCardTrigger
                render={(props) => (
                    <button
                        {...props}
                        type="button"
                        className={cn("inline-flex size-5 items-center justify-center rounded-full ring-1 ring-inset", tone)}
                        aria-label={label}
                    >
                        <Icon className="size-3" aria-hidden="true" />
                    </button>
                )}
            />
            <HoverCardContent className="text-xs">
                <p className="mb-1 font-medium">{label}</p>
                <p className="text-muted-foreground">{description}</p>
            </HoverCardContent>
        </HoverCard>
    );
}

interface RiskFlagsRowProps {
    flags: OrderRiskFlag[];
}

/** Compact horizontal row of every flag on an order — used in the table cell and quick preview. */
export function RiskFlagsRow({ flags }: RiskFlagsRowProps) {
    if (flags.length === 0) return null;
    return (
        <span className="inline-flex items-center gap-1">
            {flags.map((flag) => (
                <RiskFlagChip key={flag} flag={flag} />
            ))}
        </span>
    );
}

function safeT(t: (key: never) => string, key: string, fallback: string): string {
    try {
        return t(key as never);
    } catch {
        return fallback;
    }
}
