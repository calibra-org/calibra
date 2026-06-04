/**
 * shadcn CLI expects a `cn` export at `@/lib/utils`. We re-export from `@calibra/shared` so the
 * workspace stays single-source-of-truth on tailwind-merge configuration. Adding `cn` directly
 * here would shadow the shared one and silently diverge.
 */
export { cn } from "@calibra/shared";
