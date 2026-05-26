/**
 * Tier-3 `EntityCombobox` — canonical async-multi-select-for-entities wrapper. Every business
 * picker (ProductPicker, CategoryPicker, BrandPicker, CustomerPicker, …) composes this primitive
 * so the loading-state / chip / empty / error semantics stay consistent across resources.
 *
 * Current state: re-exports `MultiCombobox` from `components/ui/combobox/`. The dedicated
 * EntityCombobox layer (creatable rows, depth-indented tree rendering for CategoryPicker, image
 * fallback chip) is a follow-up. This folder establishes the canonical import path now so prompt
 * 05's business pickers can target it.
 *
 * Note the **load-bearing rule** documented in `combobox/README.md`: do not pass `items` to
 * `Combobox.Root` when the parent owns the search. EntityCombobox enforces it structurally by
 * always rendering its children directly from the resolved option list.
 */
export type { ComboboxLabels as EntityComboboxLabels, ComboboxOption as EntityOption } from "../combobox/combobox.types";
export { MultiCombobox as EntityCombobox } from "../combobox/multi-combobox";
