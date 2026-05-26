# `DataGrid` cell family

Preset cell renderers that wrap `#/lib/format` so view-level `columns.tsx` files stop reinventing the formatter boilerplate. Every cell normalises `null` / `undefined` to a thin em-dash (`—`) so empty cells read as "not provided" instead of vanishing into row whitespace.

## Cells

| Component | Wraps |
|---|---|
| `DataGridCellText` | text + optional truncation |
| `DataGridCellMoney` | `formatMoney` (Toman default, Rial via `display="IRR"`) |
| `DataGridCellDate` | `formatDate` (Jalali under `fa`, Gregorian under `en`) |
| `DataGridCellDateTime` | `formatDateTime` |
| `DataGridCellNumber` | `formatNumber` |
| `DataGridCellPercent` | `formatPercent` |
| `DataGridCellStatus` | `<Badge variant="secondary" tone={…} dot>` |
| `DataGridCellImage` | lazy-loaded thumbnail with size-locked fallback |

## Usage

```tsx
import {
    DataGridCellDate,
    DataGridCellMoney,
    DataGridCellStatus,
    DataGridCellText,
} from "#/components/ui/data-grid/cells";

const columns: ColumnDef<Order>[] = [
    { accessorKey: "number",     cell: ({ row }) => <DataGridCellText value={row.original.number} /> },
    { accessorKey: "totalMinor", cell: ({ row }) => <DataGridCellMoney value={row.original.totalMinor} locale={locale} /> },
    { accessorKey: "createdAt",  cell: ({ row }) => <DataGridCellDate value={row.original.createdAt} locale={locale} /> },
    {
        accessorKey: "status",
        cell: ({ row }) => (
            <DataGridCellStatus tone={statusToTone(row.original.status)}>
                {t(`status.${row.original.status}`)}
            </DataGridCellStatus>
        ),
    },
];
```

## The `DataGrid.Cell.*` namespace

The original prompt 04 spec calls for `<DataGrid.Cell.Money …>` — that namespace lands once the data-grid root component re-exports the cell module under a namespace. For now consumers import the flat `DataGridCell*` names; the namespace shape is purely cosmetic and the canonical import path stays at `#/components/ui/data-grid/cells`.

## Migrating existing `columns.tsx`

Each list view's `columns.tsx` swaps inline formatter calls for the matching cell:

| Before | After |
|---|---|
| `cell: ({ row }) => <span>{formatMoney(row.original.totalMinor, locale)}</span>` | `cell: ({ row }) => <DataGridCellMoney value={row.original.totalMinor} locale={locale} />` |
| `cell: ({ row }) => <span>{formatDate(row.original.createdAt, locale)}</span>` | `cell: ({ row }) => <DataGridCellDate value={row.original.createdAt} locale={locale} />` |
| `cell: ({ row }) => <StatusBadge tone="success">…</StatusBadge>` | `cell: ({ row }) => <DataGridCellStatus tone="success">…</DataGridCellStatus>` |

The bulk migration is mechanical and lands in a follow-up sweep.
