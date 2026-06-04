/**
 * Re-export shim → `@calibra/panel-kit`. The primitive moved into the shared operator-panel
 * package (one set of token-driven base primitives for both `apps/admin` and `apps/platform`).
 * Existing `#/components/ui/<name>` imports keep resolving through this file unchanged.
 */
export * from "@calibra/panel-kit/onboarding-hint";
