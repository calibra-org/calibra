/**
 * Tier-4 CustomerPicker. No view-local implementation exists yet — when the first customer-picker
 * surface ships it lands here directly, composing EntityCombobox + a `useCustomerSearch` /
 * `useCustomersById` query pair from #/lib/queries/customers.
 *
 * Placeholder export keeps the folder discoverable and TypeScript happy.
 */
export { EntityCombobox as CustomerPicker } from "#/components/ui/entity-combobox";
