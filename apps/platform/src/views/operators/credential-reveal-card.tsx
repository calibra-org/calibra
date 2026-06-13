"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Check, Copy, TriangleAlert } from "#/icons";
import { cn } from "#/lib/utils";

/** A monospace value with a best-effort copy button. Clipboard can fail under WSL — the durable
 * backstop is single-use + forced change, so a failed copy is not fatal (the value stays readable). */
export function CopyField({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false);
    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            /* clipboard unavailable (WSL / insecure context) — the value is shown for manual copy. */
        }
    }
    return (
        <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">{label}</span>
            <div className="flex items-center gap-2">
                <code dir="ltr" className="flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-sm">
                    {value}
                </code>
                <Button type="button" variant="outline" size="icon" aria-label="copy" onClick={copy}>
                    {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                </Button>
            </div>
        </div>
    );
}

/**
 * Reveal-once credential card. Shows either a temp password (with a "won't be shown again" warning)
 * or a single-use handoff link — never both. Shared by provisioning success, operator create, and
 * reset-password.
 */
export function CredentialRevealCard({
    email,
    tempPassword,
    handoffUrl,
    className,
}: {
    email?: string | null;
    tempPassword?: string | null;
    handoffUrl?: string | null;
    className?: string;
}) {
    const t = useTranslations("Credentials");
    return (
        <div className={cn("mission-panel flex flex-col gap-3 border border-warning/40 bg-warning/5 p-4", className)}>
            <div className="flex items-center gap-2 font-medium text-sm">
                <TriangleAlert className="size-4 text-warning" aria-hidden="true" />
                {t("title")}
            </div>
            {email ? <CopyField label={t("email")} value={email} /> : null}
            {tempPassword ? <CopyField label={t("tempPassword")} value={tempPassword} /> : null}
            {handoffUrl ? <CopyField label={t("handoffLink")} value={handoffUrl} /> : null}
            <p className="text-muted-foreground text-xs">{handoffUrl ? t("handoffHint") : t("warning")}</p>
        </div>
    );
}
