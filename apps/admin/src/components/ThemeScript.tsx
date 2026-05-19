import Script from "next/script";

/**
 * Inline boot script that reads the persisted theme from `localStorage` and applies the `.dark`
 * class on `<html>` before paint — the standard fix for dark-mode FOUC.
 *
 * Uses `next/script` with `strategy="beforeInteractive"` so the framework injects the script
 * directly into the document head at SSR time. Rendering a raw `<script>` element through React
 * works on the initial document but trips a Next.js 16 / React 19 warning ("scripts inside React
 * components are never executed when rendering on the client") because client navigation
 * wouldn't re-execute the body — `next/script` is the framework-aware substitute.
 *
 * Pair with {@link ThemeToggle} which writes back to the same `localStorage` key.
 */
export function ThemeScript() {
    return (
        <Script id="calibra-admin-theme-init" strategy="beforeInteractive">
            {`(() => {
    try {
        const stored = window.localStorage.getItem("calibra-admin-theme");
        const prefers = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
        const theme = stored === "dark" || stored === "light" ? stored : prefers ? "dark" : "light";
        if (theme === "dark") {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
        document.documentElement.style.colorScheme = theme;
    } catch (_) {}
})();`}
        </Script>
    );
}
