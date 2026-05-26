/**
 * Tier-3 `DateFilterChip` — URL-synced date filter chip used by data-table toolbars. Opens a
 * Calendar inside a Dialog (DESIGN_SYSTEM.md §3.8). Re-exports the existing `DateFilterChip` so
 * the canonical import path lands now; in a follow-up the implementation moves under
 * `components/ui/data-grid/date-filter-chip/` once `data-grid/` exists.
 */
export { DateFilterChip } from "../date-picker/filter-chip";
export { parseDateFilter, serializeDateFilter } from "../date-picker/url";
export type { UseDateFilterOptions, UseDateFilterReturn } from "../date-picker/use-date-filter";
export { useDateFilter } from "../date-picker/use-date-filter";
