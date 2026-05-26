# `DateFilterChip`

Tier-3 URL-synced date filter chip. Used in data-table toolbars; the chip opens a Calendar inside a Dialog (NOT a Popover) per DESIGN_SYSTEM.md §3.8.

```tsx
const filter = useDateFilter({ key: "placedOn", granularity: "day" });
<DateFilterChip {...filter} label={t("filters.placedOn")} />
```

Hook + URL serialisation helpers re-exported alongside (`useDateFilter`, `parseDateFilter`, `serializeDateFilter`) so consumers stay on one import path.
