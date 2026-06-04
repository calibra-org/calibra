/**
 * Backwards-compat re-export shim. The flat-file primitive moved to a folder in prompt 02
 * (`./button/index.tsx`). Existing view imports keep working — direct consumers can update
 * the import path at their leisure. This shim is removed in a follow-up cleanup once every
 * call site moves over.
 */
export * from "./button/index";
