import { DEMO_LOADERS } from "./demo-loaders";

/** Server-safe lookup. `true` when the primitive ships a live demo wired through `demos.tsx`. */
export function hasDemo(name: string): boolean {
    return name in DEMO_LOADERS;
}
