"use client";

import type { ReactNode } from "react";

import { PageHeader } from "#/components/PageHeader";
import { DraggableSectionGrid, type SectionSpec } from "#/components/sections/draggable-section-grid";

export interface DetailPageShellLabels {
    grabHandle: string;
    collapse: string;
    expand: string;
}

export interface DetailPageShellProps {
    /** Header title — ReactNode so callers can mix a code/number with a status badge. */
    title: ReactNode;
    /** Optional secondary line — created-at date, customer id, etc. */
    subtitle?: ReactNode;
    /**
     * Inline right-side actions for the header. The orders detail uses this for the status
     * flyout + a `More` dropdown; the coupons editor uses it for Save / Cancel / Status /
     * `More`. Actions live in the header by convention — no sticky bottom bar.
     */
    headerActions?: ReactNode;
    /** Optional banner rendered between the header and the grid (e.g. `Trashed` / `Locked`). */
    banner?: ReactNode;
    /**
     * Sections rendered into the main (wider) column. Each section is draggable +
     * collapsible; order + collapsed state persist per-user under
     * `<storageKeyPrefix>.main`.
     */
    mainSections: SectionSpec[];
    /**
     * Sections rendered into the right-hand 320px sidebar column. Empty array hides the
     * sidebar entirely and lets the main column take the full width.
     */
    sidebarSections?: SectionSpec[];
    /**
     * Storage key root. The shell derives `<prefix>.main` and `<prefix>.sidebar` from it so
     * the two grids never collide on `localStorage`.
     */
    storageKeyPrefix: string;
    labels: DetailPageShellLabels;
}

/**
 * Consistent two-column layout for every detail / editor page in the admin panel — header on
 * top, an optional banner, a wider main column and an optional 320px sidebar that both use
 * `DraggableSectionGrid` so an operator can reorder + collapse cards to taste. Mirrors the
 * shape of `OrdersDetail` so future detail pages (customers, products, refunds, …) can adopt
 * it without bespoke layout code.
 *
 * Convention recap (also lives in `DETAIL_PAGE.md` next to this file):
 *  - Save / Cancel / status actions go into `headerActions`. No sticky bottom bar.
 *  - The sidebar is for read-mostly cards (live stats, related history) and the editor's
 *    Save+Cancel actions card — the kind of thing an operator wants to see without scrolling.
 *  - Main column holds the form sections (general / discount / time / constraints / …).
 *  - Inside a card, use `grid grid-cols-1 md:grid-cols-2 gap-4` to keep inputs from
 *    stretching to a full-width screen.
 */
export function DetailPageShell({
    title,
    subtitle,
    headerActions,
    banner,
    mainSections,
    sidebarSections,
    storageKeyPrefix,
    labels,
}: DetailPageShellProps) {
    const hasSidebar = sidebarSections !== undefined && sidebarSections.length > 0;
    return (
        <section className="flex flex-col gap-6">
            <PageHeader title={title} subtitle={subtitle} actions={headerActions} />
            {banner}
            <div className={hasSidebar ? "grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]" : "grid grid-cols-1 gap-6"}>
                <DraggableSectionGrid storageKey={`${storageKeyPrefix}.main`} sections={mainSections} labels={labels} />
                {hasSidebar && (
                    <DraggableSectionGrid
                        storageKey={`${storageKeyPrefix}.sidebar`}
                        sections={sidebarSections ?? []}
                        labels={labels}
                    />
                )}
            </div>
        </section>
    );
}
