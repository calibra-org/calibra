/**
 * Tier-4 MoneyInput. Tier-4 because it knows the rial → toman conversion + locale-aware digit
 * rendering. Re-exports the existing tier-2 `components/ui/money-input.tsx` from its canonical
 * tier-4 location so business surfaces target the right path; the literal file move + standalone
 * folder shape is a follow-up.
 */
export { MoneyInput } from "#/components/ui/money-input";
