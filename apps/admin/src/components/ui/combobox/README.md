# `Combobox` / `MultiCombobox`

Tier-2 async searchable picker. The canonical "select one (or many) from a remote searchable list" primitive — single-select via `Combobox`, multi-select via `MultiCombobox`. Tier-4 business pickers (`ProductPicker`, `CategoryPicker`, `BrandPicker`, `CustomerPicker` — landing in prompt 05) all wrap these via the upcoming `EntityCombobox` (tier 3), never reach for Base UI's `Combobox` directly.

## Shape

```tsx
import { Combobox, MultiCombobox, type ComboboxOption } from "#/components/ui/combobox";

// Single-select
<Combobox
    value={parentId}
    onValueChange={setParentId}
    onSearch={(q) => searchCategories(q)}
    onResolve={([id]) => fetchCategoryById(id).then((c) => [toOption(c)])}
    labels={{ placeholder: t("placeholder"), search: t("search"), empty: t("empty") }}
/>

// Multi-select
<MultiCombobox
    selectedIds={tagIds}
    onSelectionChange={setTagIds}
    onSearch={(q) => searchTags(q)}
    onResolve={(ids) => fetchTagsByIds(ids).then((tags) => tags.map(toOption))}
    labels={{ placeholder: t("placeholder"), search: t("search"), empty: t("empty"), remove: t("remove"), clearAll: t("clearAll") }}
/>
```

`ComboboxOption`: `{ id, label, sublabel?, imageUrl?, disabled? }`.

## The "do not pass `items`" rule (load-bearing)

**Never pass `items` to `BaseCombobox.Root`** when the parent owns the search. Base UI would run its own local filter against `inputValue` using `itemToStringLabel`, on top of the parent's already-server-filtered list — typing in the input then looks like "all rows still showing" because Base UI doesn't know our results came back pre-filtered from the server.

This primitive enforces the rule structurally: it renders `Combobox.Item` children directly from the resolved list and skips the `items` prop entirely. Selection ownership is also external — Base UI just emits highlight + Enter intent, and this component decides what to do with it.

## Loading / Empty / Error contract

- **Loading on first open** — popup shows the inline `<Spinner size="sm" />` next to the search input until the parent's `onSearch` resolves.
- **Mid-search loading** — typing fires a debounced re-search (250 ms); the spinner shows during the in-flight request.
- **Empty** — the `Empty` slot only renders *after* the promise resolves with zero rows, never mid-flight. (This is the canonical bug we're protecting against: typing one character and seeing "no results" because the empty state fired before the search even resolved.)
- **Error** — parent's responsibility. If `onSearch` throws, the caller should catch + show a toast / inline error. The popup itself doesn't render an error UI; that's a future addition once we lock in error-presentation semantics across primitives.
- **Stale-response guard** — `requestId` ref discards results from earlier keystrokes, so the last successful response always wins.

## Notes

- `Combobox.Item` rows truncate long text via `min-w-0 truncate` so a 200-char product name doesn't blow the popup horizontally.
- The popup is portaled with `collisionPadding={16}` so it floats above any Sheet / Dialog the trigger lives in.
- RTL-aware via `align="start"` (Base UI resolves to the right edge under `dir="rtl"`).
- The chip strip in `MultiCombobox` uses the same `Badge` primitive every other selection UI uses — composes inside sheets / cards without one-off styling.
- `hideChips` suppresses the default strip when the caller renders a richer selection display (e.g. a thumbnail + name + qty list in coupons' product include/exclude).
