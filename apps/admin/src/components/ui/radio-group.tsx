/**
 * Re-export shim → `@calibra/panel-kit`. The primitive moved into the shared operator-panel
 * package (one set of token-driven base primitives for both `apps/admin` and `apps/platform`).
 * Existing `#/components/ui/radio-group` imports keep resolving through this file unchanged
 * (the `radio.tsx` shim covers `#/components/ui/radio`).
 */
export * from "@calibra/panel-kit/radio-group";
