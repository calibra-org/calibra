/**
 * `@calibra/panel-kit` — token-driven base primitives shared by the two shadcn operator panels
 * (`apps/admin` + `apps/platform`). The primitives are headless: their appearance comes entirely
 * from each host app's `globals.css` token values (`bg-background`, `text-foreground`, `bg-primary`,
 * `ring-ring`, …), never from hardcoded colors here. The SAME primitive therefore renders
 * admin-styled in admin and platform-styled in platform. `apps/web` (pure-Tailwind storefront)
 * never imports this package.
 *
 * The icon registry is exported separately under `@calibra/panel-kit/icons` (it re-exports a
 * `Spinner` alias of `Loader2` that would collide with the Spinner primitive in this barrel).
 */
export * from "./alert-dialog";
export * from "./avatar";
export * from "./badge";
export * from "./button";
export * from "./card";
export * from "./checkbox";
export * from "./dialog";
export * from "./dropdown-menu";
export * from "./empty-state";
export * from "./helper-tooltip";
export * from "./hover-card";
export * from "./input";
export * from "./label";
export * from "./number-field";
export * from "./onboarding-hint";
export * from "./popover";
export * from "./progress";
export * from "./radio-group";
export * from "./scroll-area";
export * from "./select";
export * from "./separator";
export * from "./sheet";
export * from "./skeleton";
export * from "./slider";
export * from "./spinner";
export * from "./sticky-action-bar";
export * from "./switch";
export * from "./table";
export * from "./tabs";
export * from "./textarea";
export * from "./toast";
export * from "./tooltip";
