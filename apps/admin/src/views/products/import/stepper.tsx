"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "#/lib/utils";

import type { WizardStep } from "./wizard-state";

export interface StepperProps {
    current: WizardStep;
    farthest: WizardStep;
    onStepClick?: (step: WizardStep) => void;
}

const ORDER: WizardStep[] = ["upload", "mapping", "importing", "done"];

/**
 * Top-of-page step indicator. RTL-aware (visually reads right-to-left when `dir="rtl"`).
 * Completed steps are clickable to enable re-entry to mapping/preview after first run; the
 * `onStepClick` callback gates which back-jumps are actually allowed by the parent state.
 */
export function Stepper({ current, farthest, onStepClick }: StepperProps): React.JSX.Element {
    const t = useTranslations("ProductsImport.steps");
    const currentIdx = ORDER.indexOf(current);
    const farthestIdx = ORDER.indexOf(farthest);

    return (
        <ol className="flex flex-wrap items-center gap-3" aria-label={t("aria")}>
            {ORDER.map((step, idx) => {
                const status: "complete" | "current" | "upcoming" =
                    idx < currentIdx ? "complete" : idx === currentIdx ? "current" : "upcoming";
                const clickable = onStepClick !== undefined && idx <= farthestIdx && idx !== currentIdx;
                return (
                    <li key={step} className="flex items-center gap-3">
                        <button
                            type="button"
                            disabled={!clickable}
                            onClick={() => clickable && onStepClick?.(step)}
                            className={cn(
                                "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors",
                                status === "current" && "bg-primary text-primary-foreground",
                                status === "complete" && "bg-primary/15 text-primary hover:bg-primary/25",
                                status === "upcoming" && "bg-muted text-muted-foreground",
                                clickable && "cursor-pointer",
                            )}
                        >
                            <span
                                className={cn(
                                    "inline-flex size-6 items-center justify-center rounded-full text-xs",
                                    status === "current" && "bg-primary-foreground/20 text-primary-foreground",
                                    status === "complete" && "bg-primary text-primary-foreground",
                                    status === "upcoming" && "bg-background text-muted-foreground",
                                )}
                            >
                                {status === "complete" ? <Check className="size-3.5" aria-hidden /> : idx + 1}
                            </span>
                            <span className="font-medium">{t(step)}</span>
                        </button>
                        {idx < ORDER.length - 1 ? (
                            <span
                                aria-hidden
                                className={cn(
                                    "h-px w-8 transition-colors",
                                    idx < currentIdx ? "bg-primary/40" : "bg-border",
                                )}
                            />
                        ) : null}
                    </li>
                );
            })}
        </ol>
    );
}
