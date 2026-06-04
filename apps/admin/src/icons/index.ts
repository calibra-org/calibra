/**
 * Re-export shim → `@calibra/panel-kit/icons`. The icon registry (lucide re-exports + RTL-aware
 * directional aliases + the `Spinner` = `Loader2` alias) moved into the shared operator-panel
 * package. Existing `#/icons` imports keep resolving through this file unchanged.
 *
 * The directional aliases tag icons with `data-rtl-flip`; the CSS rule that flips them under
 * `dir="rtl"` still lives in each app's `styles/globals.css`.
 */
export * from "@calibra/panel-kit/icons";
