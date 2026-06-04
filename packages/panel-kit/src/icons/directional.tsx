/**
 * Logical (writing-direction-aware) icon aliases. Use these whenever an icon's meaning is
 * "toward the start of the reading direction" or "toward the end" — e.g. back / forward,
 * previous / next, collapse / expand. Each alias renders the LTR-side-pointing lucide icon
 * and tags it with `data-rtl-flip`; the CSS rule in `styles/globals.css` flips it under
 * `dir="rtl"` automatically.
 *
 * Non-directional icons (X, Search, Check, Trash, …) do not get logical variants — they
 * render the same in both directions. Import those from `#/icons` directly.
 */
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, type LucideProps } from "lucide-react";

/** Logical "start" chevron — flips automatically under RTL. Use for back / previous / collapse. */
export function ChevronStart(props: LucideProps) {
    return <ChevronLeft data-rtl-flip {...props} />;
}

/** Logical "end" chevron — flips automatically under RTL. Use for forward / next / expand. */
export function ChevronEnd(props: LucideProps) {
    return <ChevronRight data-rtl-flip {...props} />;
}

/** Logical "start" arrow — flips automatically under RTL. Use for back / return semantics. */
export function ArrowStart(props: LucideProps) {
    return <ArrowLeft data-rtl-flip {...props} />;
}

/** Logical "end" arrow — flips automatically under RTL. Use for forward / continue semantics. */
export function ArrowEnd(props: LucideProps) {
    return <ArrowRight data-rtl-flip {...props} />;
}

/** Logical "first" double chevron — flips automatically under RTL. Use for jump-to-first-page semantics. */
export function ChevronsStart(props: LucideProps) {
    return <ChevronsLeft data-rtl-flip {...props} />;
}

/** Logical "last" double chevron — flips automatically under RTL. Use for jump-to-last-page semantics. */
export function ChevronsEnd(props: LucideProps) {
    return <ChevronsRight data-rtl-flip {...props} />;
}
