# `DatePickerField`

Tier-3 single-date input. Opens a Calendar inside a Dialog (DESIGN_SYSTEM.md §3.8).

```tsx
<DatePickerField value={placedOn} onChange={setPlacedOn} granularity="day" />
```

Current implementation re-exports the existing `DateField` primitive. The internal `Popover` → `Dialog` swap is a follow-up; the API surface stays identical so call sites can already import from the canonical path.

For ranges, use `DateRangePickerField`. For URL-synced filter chips, use `DateFilterChip`.
