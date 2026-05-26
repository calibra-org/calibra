# `Calendar`

Tier-3 Jalali-aware calendar body. **Calendar-in-Dialog only** per DESIGN_SYSTEM.md §3.8 — for date input flows, reach for `DatePickerField` (single) or `DateRangePickerField` (range), both of which open the Calendar inside a Dialog.

Current state: re-exports the existing `DatePickerDialog` from `components/ui/date-picker/`. The fully-extracted headless body (Calendar separate from Dialog chrome) is a follow-up; this folder establishes the canonical import path so future call sites land at the right place.

For the URL-synced date filter chip used by data-table toolbars, use `DateFilterChip` from `components/ui/date-filter-chip/`.
