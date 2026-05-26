"use client";

import { useState } from "react";

import { Check, Copy } from "#/icons";
import { cn } from "#/lib/utils";

/** Copy-to-clipboard button rendered in the top-end corner of `CodeBlock`. Flashes "Copied" 1.5s. */
export function CodeBlockCopyButton({ code }: { code: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            aria-label="Copy code"
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(code);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                } catch {
                    /** Clipboard blocked — silent no-op rather than scaring the operator. */
                }
            }}
            className={cn(
                "absolute end-2 top-2 z-10 grid size-7 place-items-center rounded-md border border-border bg-card/95 text-muted-foreground opacity-0 backdrop-blur transition-opacity",
                "hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
            )}
        >
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        </button>
    );
}
CodeBlockCopyButton.displayName = "CodeBlockCopyButton";
