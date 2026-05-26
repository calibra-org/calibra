import { codeToHtml } from "shiki";

import { cn } from "#/lib/utils";

import { CodeBlockCopyButton } from "./code-block.client";

export interface CodeBlockProps {
    code: string;
    language?: "tsx" | "ts" | "bash" | "json" | "css" | "html" | "md";
    /** Default `github-light` / `github-dark`. Override with any shiki bundled theme pair. */
    theme?: { light: string; dark: string };
    /** Show a copy-to-clipboard button in the top-end corner. Defaults to `true`. */
    copy?: boolean;
    className?: string;
}

/**
 * Tier-3 Shiki-rendered code block. **Server component** — shiki runs at request time and emits
 * HTML; the highlighter never reaches the client bundle. Two HTML payloads are rendered (light +
 * dark) and the active one is selected via Tailwind's `dark:` modifier so theme switches don't
 * require a re-fetch.
 *
 * Used by the `/dev/ds` showcase to display each primitive's source. Available as a tier-3 prim
 * so any future doc surface (CLI cheat sheet, release notes, etc.) can render highlighted code
 * without re-installing shiki per consumer.
 */
export async function CodeBlock({ code, language = "tsx", theme, copy = true, className }: CodeBlockProps) {
    const lightTheme = theme?.light ?? "github-light";
    const darkTheme = theme?.dark ?? "github-dark";
    const [lightHtml, darkHtml] = await Promise.all([
        codeToHtml(code, { lang: language, theme: lightTheme }),
        codeToHtml(code, { lang: language, theme: darkTheme }),
    ]);
    return (
        <div
            data-slot="code-block"
            className={cn(
                "group relative overflow-hidden rounded-md border border-border bg-card text-sm",
                "[&_pre]:overflow-auto [&_pre]:p-4 [&_pre]:text-[0.85em] [&_pre]:leading-relaxed",
                className,
            )}
        >
            {copy && <CodeBlockCopyButton code={code} />}
            {/** biome-ignore lint/security/noDangerouslySetInnerHtml: shiki emits the highlighted HTML from a static `code` string. */}
            <div className="block dark:hidden" dangerouslySetInnerHTML={{ __html: lightHtml }} />
            {/** biome-ignore lint/security/noDangerouslySetInnerHtml: shiki emits the highlighted HTML from a static `code` string. */}
            <div className="hidden dark:block" dangerouslySetInnerHTML={{ __html: darkHtml }} />
        </div>
    );
}
