/**
 * Tier-3 `DateRangePickerField` — range input that opens its Calendar inside a Dialog (NOT a
 * Popover). Per DESIGN_SYSTEM.md §3.8.
 *
 * Re-exports the existing `DateRangeField` under the canonical name. Internal `Popover` →
 * `Dialog` swap is a follow-up cleanup.
 */
export { DateRangeField as DateRangePickerField } from "../date-picker/date-range-field";
