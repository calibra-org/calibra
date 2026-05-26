/**
 * Tier-3 `DatePickerField` — single-date input that opens its Calendar inside a Dialog (NOT a
 * Popover). Per DESIGN_SYSTEM.md §3.8, every date-input flow in the admin uses this primitive
 * (or `DateRangePickerField` for ranges).
 *
 * Current implementation re-exports the existing `DateField` from `components/ui/date-picker/`
 * under the canonical name. The internal swap from `DatePickerPopover` to `DatePickerDialog`
 * lands in a follow-up cleanup; this folder establishes the canonical import path so view-level
 * call sites can migrate ahead of the internal rewire without breaking.
 */
export { DateField as DatePickerField } from "../date-picker/date-field";
