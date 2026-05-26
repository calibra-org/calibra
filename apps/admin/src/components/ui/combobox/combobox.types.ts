/**
 * Shared option + label types for the {@link Combobox} family. Tier-4 business pickers (Product /
 * Category / Brand / Customer / …) map their domain shapes onto `ComboboxOption`, so the underlying
 * primitive stays purely visual.
 */

export interface ComboboxOption {
    id: number | string;
    label: string;
    sublabel?: string;
    /** Optional thumbnail URL rendered as a 32px square inside the list row + chip. */
    imageUrl?: string | null;
    /** Disabled rows can't be selected (e.g. items the operator already used elsewhere). */
    disabled?: boolean;
}

export interface ComboboxLabels {
    /** Placeholder rendered inside the trigger button when nothing is selected. */
    placeholder: string;
    /** Placeholder rendered inside the popup's search input. */
    search: string;
    /** Empty-state message when the search returned no rows. */
    empty: string;
    /** Aria label for the per-chip remove button (multi only). */
    remove: string;
    /** "Clear all" link rendered above the chip strip when 2+ items are selected (multi only). */
    clearAll: string;
}
