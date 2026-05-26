/**
 * Backwards-compat re-export shim. The flat-file primitive moved to a folder in prompt 02
 * (`./combobox/index.tsx`) and gained a single-select `Combobox` alongside `MultiCombobox`.
 * Existing imports of `MultiCombobox` continue to resolve unchanged.
 */
export * from "./combobox/index";
