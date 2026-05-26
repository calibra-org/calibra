/**
 * Tier-4 ProductPicker. Composes `EntityPicker` (the `MultiCombobox`-backed tier-3 wrapper from
 * `components/shared/entity-picker`) + queries `apiGet("products", ...)`. Domain knowledge in the
 * label-resolution helper (Persian / English / map-shape fallbacks); selection state is owned by
 * the caller via `selectedIds` + `onSelectionChange`.
 *
 * Used by the coupon editor's "include / exclude products" surface. Every other view that needs
 * a product picker should import from here — no other combobox is allowed to back a product list.
 */
export { ProductPicker } from "./picker";
