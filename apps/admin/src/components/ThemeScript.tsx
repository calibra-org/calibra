/**
 * Renders an inline `<script>` that reads the persisted theme preference from `localStorage` and
 * applies the `.dark` class on `<html>` before paint. Inlining is the only way to avoid the
 * classic dark-mode FOUC; the script is tiny so the cost is negligible.
 *
 * Pair with {@link ThemeToggle} which writes back to the same `localStorage` key.
 */
export function ThemeScript() {
    const script = `(() => {
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
})();`;
    // biome-ignore lint/security/noDangerouslySetInnerHtml: inline boot script is the documented Next.js FOUC-mitigation pattern for dark mode; content is a string literal compiled into the module (no user input flows in).
    return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
