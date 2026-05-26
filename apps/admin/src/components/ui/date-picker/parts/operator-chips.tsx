"use client";

import { cn } from "#/lib/utils";

import type { Operator } from "../types";

interface OperatorChipsProps {
    operator: Operator;
    allowed: Operator[];
    onChange: (op: Operator) => void;
    labelFor: (op: Operator) => string;
    /** Accessible label for the radiogroup as a whole. */
    groupLabel: string;
}

/**
 * Top-row operator selector. Renders the allowed verbs as a single-select pill row; only one
 * operator is active at a time. Implements `role="radiogroup"` so screen readers describe the
 * group correctly even though the visual shape reads as buttons.
 */
export function OperatorChips({ operator, allowed, onChange, labelFor, groupLabel }: OperatorChipsProps) {
    return (
        <div role="radiogroup" aria-label={groupLabel} className="inline-flex items-center gap-1">
            {allowed.map((op) => (
                <RadioChipButton key={op} active={op === operator} onClick={() => onChange(op)} label={labelFor(op)} />
            ))}
        </div>
    );
}

/**
 * One pill in the {@link OperatorChips} group. Lifted out so the lint suppression for the
 * radio-role-on-button pattern sits in a single, justified place — the WAI-ARIA APG toggle-style
 * radio group is the right pattern for a visually-chipped single-select, but Biome's
 * `useSemanticElements` rule wants a native `<input type="radio">` which can't carry the pill
 * styling without heavy CSS hacks.
 */
function RadioChipButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
    return (
        // biome-ignore lint/a11y/useSemanticElements: see component JSDoc above.
        <button
            type="button"
            role="radio"
            aria-checked={active}
            onClick={onClick}
            className={cn(
                "inline-flex h-7 items-center rounded-full border px-3 text-xs outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
                active
                    ? "border-transparent bg-accent text-accent-foreground"
                    : "border-border bg-transparent text-muted-foreground hover:bg-muted/50",
            )}
        >
            {label}
        </button>
    );
}
