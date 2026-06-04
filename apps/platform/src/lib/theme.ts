import "server-only";

import { cookies } from "next/headers";

/**
 * Cookie holding the resolved console theme preference. Set by `ThemeToggle` on the client
 * (`document.cookie`) so server renders pick up the latest selection without a round-trip.
 * Storing the resolved value here (rather than the user's "system" intent) means SSR can write
 * the matching `.dark` class on `<html>` directly — no inline boot script, no React 19 warning,
 * no FOUC.
 */
export const THEME_COOKIE = "calibra-console-theme";

export type ResolvedTheme = "light" | "dark";

/**
 * Reads the resolved theme from the cookie. The console is **dark-first** — operators expect a
 * mission-control surface — so the default when the cookie is absent (or holds an unrecognised
 * value) is `"dark"`. Only an explicit `"light"` selection opts out. The admin panel keeps its
 * own light-first default; this divergence is intentional.
 */
export async function getResolvedTheme(): Promise<ResolvedTheme> {
    const store = await cookies();
    const value = store.get(THEME_COOKIE)?.value;
    return value === "light" ? "light" : "dark";
}
