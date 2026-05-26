/**
 * Tier-4 ProductPicker. Composes `EntityCombobox` + the products query hook. Current
 * implementation re-exports the existing view-local picker from `views/coupons/shared/`; the
 * standalone tier-4 extraction with its own query hook lands in a follow-up.
 */
export { ProductPicker } from "#/views/coupons/shared/product-picker";
