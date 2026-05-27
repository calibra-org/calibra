# Date filter primitive

Linear-style date picker for the admin. One component, three faces:

- **Filter mode** — `DateFilterChip` mounted on every list page's toolbar.
- **Form mode** — `DateField` / `DateRangeField` for individual date inputs.
- **Headless** — `useDateFilter` hook owns all state; build a custom shell if neither face fits.

## Why this exists

Before this primitive landed, the admin had ad-hoc `<input type="date">` pairs (`created_after` /
`created_before`) sprinkled across list filters and forms. They didn't support Jalali, weren't
keyboard-friendly, and shipped raw browser UI that didn't match the rest of the admin. The chip
ships behind a single, accessible component that:

- supports Day / Month / Quarter / Half-year / Year granularities
- supports `in` / `before` / `after` / `within` operators
- has a hand-rolled grammar so operators can type things like `Q4 2026`, `today`, `این هفته`
- renders Jalali end-to-end (period grids, day grid, parser, formatter) via a swappable `DateLib`
- commits instantly on direct grid click (Linear's signature lever — no Apply button to fight)
- round-trips through the URL so deep links restore exactly

## Public exports

```ts
import {
    DateFilterChip,     // toolbar pill ([label | op | value | ×])
    DatePickerDialog,   // modal wrapper around the body
    DatePickerPopover,  // anchor-mounted wrapper — for chips/toolbars only
    DateField,          // single-date form input (opens as Dialog)
    DateRangeField,     // [start, end] form input (opens as Dialog)
    OperatorMenu,       // small dropdown for switching operator from a chip
    useDateFilter,      // headless hook — own the dialog yourself
    parseDateFilterInput, // pure parser; same grammar the input field uses
    formatDateFilterValue,
    serializeDateFilter, parseDateFilter, toLegacyDateRange, // URL + back-compat
} from "#/components/ui/date-picker";
```

## Dialog vs Popover — which to use

**Default in form pages: Dialog.** `DateField` and `DateRangeField` open as a modal dialog by
design. The picker needs ~28rem of horizontal room plus the quick-pick row beneath it; an
anchor-mounted popover gets clipped by sticky page headers, sidebar cards, dialog panels, and
RTL viewport edges. The modal removes every alignment + z-index concern at once.

**Use the popover variant only for the data-table filter chip** (`DateFilterChip`), where the
chip is the anchor and operators expect the picker to attach to it. Anything that lives inside a
form card should open as a dialog. If you're tempted to reach for `DatePickerPopover` from a
form, you're almost certainly wrong — extend the dialog wrapper instead.

## Usage — filter chip in a data table

```tsx
import { type DateFacetDef, DataTableToolbar } from "#/components/ui/data-grid";

const dateFacets: DateFacetDef[] = [
    { paramKey: "created", label: t("filters.created") },
];

const tableState = useDataTable({ id: "orders.list", dateFacets });

useOrdersList({
    query: useMemo(
        () => ({
            filter: dateFilterValueToTableViewFilter("created_at", tableState.dateFacetValues.created),
            sort: [{ field: "created_at", dir: "desc" }],
        }),
        [tableState.dateFacetValues.created],
    ),
});

<DataTableToolbar
    dateFacets={dateFacets}
    dateFacetValues={tableState.dateFacetValues}
    onDateFacetChange={tableState.setDateFilterValue}
    locale={locale}
    {/* …other props */}
/>;
```

## Usage — form-mode single date

```tsx
import { DateField } from "#/components/ui/date-picker";

<DateField
    locale={locale}
    label={t("expiresAt")}
    value={form.values.expires_at}          // calendar-native YYYY-MM-DD string
    onChange={(next) => form.setFieldValue("expires_at", next)}
/>;
```

## Architecture

```
date-picker/
├── types.ts                  DateFilterValue, Granularity, Operator
├── date-lib.ts               getDateLib(calendar) + period math (Q / H / Y)
├── format.ts                 value → display string (locale-aware digits)
├── parse.ts                  11-branch grammar (try in order; first match wins)
├── url.ts                    serialize / parse the URL form
├── use-date-filter.ts        headless state machine
├── date-picker-body.tsx      shared body rendered by both wrappers
├── date-picker-dialog.tsx    modal wrapper (filter mode)
├── date-picker-popover.tsx   non-modal wrapper (form mode)
├── filter-chip.tsx           3-segment chip + clear button
├── operator-menu.tsx         in-place operator switcher
├── date-field.tsx            form-mode single date
├── date-range-field.tsx      form-mode range
└── parts/                    operator chips, value input, granularity tabs,
                              dialog actions, day grid, period grids
```

## Calendar swap

`getDateLib("gregorian")` returns react-day-picker's `defaultDateLib`.
`getDateLib("jalali")` returns a `DateLib` constructed with `date-fns-jalali` as the overrides
namespace and `weekStartsOn: 6` so Jalali grids render Saturday-first.

All period math (`startOfQuarter`, `endOfHalfYear`, …) is calendar-agnostic: both calendars use
12 months, so `q = floor(month / 3) + 1` and `h = floor(month / 6) + 1` work as-is.

Storage values are **always ASCII** regardless of calendar — Jalali is encoded as `1405-02-30`,
not `۱۴۰۵-۰۲-۳۰`. Persian digits only appear at the display layer (via `toPersianDigits` from
`@calibra/shared/digits`) when `locale === "fa"`.

## Parser grammar (tried in order)

1. Empty / whitespace → `{ error: 'empty' }`
2. Relative keywords — `today`, `yesterday`, `tomorrow`, `this/last/next month/quarter/year`,
   `این هفته`, `پارسال`, `امروز`, …
3. Quarter — `Q1..Q4`, `Q4 2025`, `2025-Q4`, `2025/Q4`
4. Half-year — `H1`, `H2`, `2025-H1`
5. ISO date — `YYYY-MM-DD`
6. ISO month — `YYYY-MM`
7. Slash date — `MM/DD/YYYY` (en), `DD/MM/YYYY` (fa), `YYYY/MM/DD` (both)
8. Named month — `May 2027`, `September 2026`, `اردیبهشت 1405`, `30 اردیبهشت 1405`
9. ISO year — `YYYY` (3–4 digits)
10. Number-only — 3–4 digits as year; 1–2 digits → `{ error: 'ambiguous' }`
11. Anything else → `{ error: 'invalid' }`

Persian / Arabic-Indic digits are normalised to ASCII before any branch runs. ZWNJ (U+200C) is
collapsed to a regular space so `این‌هفته` and `این هفته` parse identically.

## URL serialization

`<facet>=<op>:<value>` for single-point operators, `<facet>=within:<start>..<end>` for ranges.
Examples:

```
?created=before:2025
?created=in:2025-Q4
?created=within:2025-05-01..2025-05-07
```

Backend endpoints consume the resolved Gregorian ISO range as a TableView `filter[]=` entry
on the corresponding date column, built via `dateFilterValueToTableViewFilter(field, value)`.
The picker's calendar is irrelevant on the wire — the API stays calendar-agnostic and works
in UTC.

## Keyboard

| Key                | Behaviour                                                |
| ------------------ | -------------------------------------------------------- |
| ←/→/↑/↓            | Move focus in the active grid (RDP handles for Day)      |
| PgUp / PgDn        | Prev / next month in Day grid                            |
| Shift + PgUp / PgDn| Prev / next year                                         |
| Home / End         | Start / end of week in Day grid; first/last tab elsewhere |
| Enter              | Commit focused cell (or Apply when input is dirty)       |
| Esc                | Cancel dialog                                            |

## What's intentionally out of scope

- **Time picker** — `fieldType: "datetime"` on `DateFacetDef` is reserved for a future PR.
- **Fiscal-year configuration** — quarters / halves are calendar-year, not fiscal.
- **Date-range relative presets** — no "Last 7 days" preset row; users get the same outcome via
  `this week` typed into the input or by picking `within` on the Day grid.
