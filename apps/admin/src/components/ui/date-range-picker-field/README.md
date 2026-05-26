# `DateRangePickerField`

Tier-3 date-range input. Opens a Calendar inside a Dialog (DESIGN_SYSTEM.md §3.8).

```tsx
<DateRangePickerField value={range} onChange={setRange} granularity="day" />
```

Currently re-exports the existing `DateRangeField` primitive — API identical, canonical import path established. For single dates use `DatePickerField`; for URL-synced filter chips use `DateFilterChip`.
