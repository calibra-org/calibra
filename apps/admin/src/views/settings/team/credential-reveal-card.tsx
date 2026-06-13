"use client";

import { Check, Copy, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

function CopyField({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false);
    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            /* clipboard unavailable — value stays readable for manual copy. */
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
                    {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                </Button>
            </div>
        </div>
    );
}

/** Reveal-once operator credentials (temp password OR single-use handoff link, never both). */
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
    const t = useTranslations("Team");
    return (
        <div className={cn("flex flex-col gap-3 rounded-lg border border-amber-400/50 bg-amber-50/60 p-4 dark:bg-amber-950/20", className)}>
            <div className="flex items-center gap-2 font-medium text-sm">
                <TriangleAlert className="size-4 text-amber-600" aria-hidden="true" />
                {t("credTitle")}
            </div>
            {email ? <CopyField label={t("credEmail")} value={email} /> : null}
            {tempPassword ? <CopyField label={t("credTempPassword")} value={tempPassword} /> : null}
            {handoffUrl ? <CopyField label={t("credHandoffLink")} value={handoffUrl} /> : null}
            <p className="text-muted-foreground text-xs">{handoffUrl ? t("credHandoffHint") : t("credWarning")}</p>
        </div>
    );
}
