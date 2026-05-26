"use client";

import { cn } from "@calibra/shared";
import { Info } from "lucide-react";
import type React from "react";

import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";

export interface FieldProps {
    id: string;
    label: string;
    error?: string;
    hint?: string;
    span?: string;
    /** Inline helper slot rendered next to the label (typically a HelperTooltip). */
    helper?: React.ReactNode;
    children: React.ReactNode;
}

/**
 * Form-grid cell: label on top, control in the middle, error or hint below. The cell takes one of
 * a 12-column track via the `span` prop (Tailwind classes like `col-span-6 md:col-span-3`).
 *
 * Shared between Quick Edit (compact sheet inside the list) and the product detail page (dense
 * card-grid form). Identical visual treatment in both surfaces — the prompt explicitly forbids
 * forking another `Field`.
 */
export function Field({ id, label, error, hint, span, helper, children }: FieldProps) {
    return (
        <div className={cn("flex min-w-0 flex-col gap-1", span)}>
            <Label htmlFor={id} className="flex items-center font-medium text-foreground text-xs">
                {label}
                {helper}
            </Label>
            {children}
            {error !== undefined ? (
                <p className="inline-flex items-center gap-1 text-destructive text-xs">
                    <Info className="size-3" aria-hidden="true" />
                    {error}
                </p>
            ) : hint !== undefined ? (
                <p className="truncate text-muted-foreground text-xs" dir="ltr">
                    {hint}
                </p>
            ) : null}
        </div>
    );
}

export interface ToggleRowProps {
    id: string;
    title: string;
    description?: string;
    icon: React.ReactNode;
    checked: boolean;
    onChange: (next: boolean) => void;
    compact?: boolean;
    span?: string;
}

/**
 * Boolean field rendered as a single-row label+icon+switch tile that fills one grid cell. Used
 * for every product toggle (Manage stock, Virtual, Sold individually, Featured, …) so the form
 * grid stays uniform regardless of control type.
 */
export function ToggleRow({ id, title, icon, checked, onChange, compact, span }: ToggleRowProps) {
    return (
        <label
            htmlFor={id}
            className={cn(
                "flex h-9 cursor-pointer items-center gap-2 self-end rounded-md border border-border bg-background px-2.5 transition-colors hover:border-ring/40",
                compact ? "py-1" : "py-1.5",
                span,
                checked && "border-primary/40 bg-primary/5",
            )}
        >
            <span className={cn("shrink-0 text-muted-foreground", checked && "text-primary")}>{icon}</span>
            <span className="min-w-0 flex-1 truncate font-medium text-foreground text-xs">{title}</span>
            <Switch id={id} checked={checked} onCheckedChange={onChange} />
        </label>
    );
}

export interface LocaleTabsProps {
    locales: readonly { code: string; label: string; isDefault?: boolean }[];
    active: string;
    onChange: (code: string) => void;
    children: (active: string) => React.ReactNode;
}

/**
 * Per-locale field group. The active locale's inputs are visible; the inactive locale stays
 * mounted via render-prop indirection so RHF doesn't unregister fields when the operator
 * switches tabs. Always shows "Persian (default)" / "English (secondary)" sub-labels so the
 * operator knows which side they're editing.
 */
export function LocaleTabs({ locales, active, onChange, children }: LocaleTabsProps) {
    return (
        <div className="flex flex-col gap-3">
            <div className="inline-flex items-center self-start rounded-md border border-border bg-card p-0.5">
                {locales.map((locale) => {
                    const isActive = locale.code === active;
                    return (
                        <button
                            key={locale.code}
                            type="button"
                            onClick={() => onChange(locale.code)}
                            className={cn(
                                "rounded-sm px-3 py-1 font-medium text-xs transition-colors",
                                isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                            )}
                            aria-pressed={isActive}
                        >
                            {locale.label}
                            {locale.isDefault ? <span className="ms-1 text-[10px] text-muted-foreground">★</span> : null}
                        </button>
                    );
                })}
            </div>
            {children(active)}
        </div>
    );
}
