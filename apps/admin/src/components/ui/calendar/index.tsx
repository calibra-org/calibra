/**
 * Tier-3 Calendar primitive. The headless Jalali-aware calendar body. Currently re-exports the
 * existing `DatePickerDialog` body parts that live under `components/ui/date-picker/` — the full
 * extraction (headless body separate from the Dialog chrome) is deferred to a follow-up; this
 * folder establishes the canonical import path now so DESIGN_SYSTEM.md §3.8 ("Calendar-in-Dialog
 * only") points at a real folder.
 *
 * The compound subparts and types come from the existing implementation untouched.
 */

export { dateToValueString, getDateLib, periodEnd, toGregorianISO, valueStringToDate } from "../date-picker/date-lib";
export { DatePickerDialog as Calendar } from "../date-picker/date-picker-dialog";
export type { Calendar as CalendarLib, DateFilterValue, Granularity, Operator, PeriodString } from "../date-picker/types";
