/**
 * Hand-written CSS for the web panel, exported as a string so it can be both inlined
 * into the SSR shell ({@link "./page"}) and re-injected on the client ({@link "./client"}).
 * A dev tool, deliberately *not* Tailwind/panel-kit — the panel must render with zero
 * build coupling to the apps it inspects. The palette tracks GitHub dark.
 *
 * Phase 0 ships only the shell + boot styles; Phase 6 expands this into the full panel.
 */
export const PANEL_CSS = `
:root {
    color-scheme: dark;
    --bg: #0d1117;
    --panel: #161b22;
    --panel-2: #1c2128;
    --border: #30363d;
    --fg: #e6edf3;
    --muted: #8b949e;
    --accent: #2f81f7;
    --ok: #3fb950;
    --warn: #d29922;
    --bad: #f85149;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
    background: var(--bg);
    color: var(--fg);
    font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code { font-family: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace; font-size: 0.92em; }
.spin-shell { max-width: 1120px; margin: 0 auto; padding: 24px clamp(16px, 4vw, 40px); }
.spin-header { display: flex; align-items: baseline; gap: 12px; border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 20px; }
.spin-header strong { font-size: 18px; letter-spacing: 0.5px; }
.spin-badge { font-size: 12px; color: var(--muted); }
.spin-card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; }
.spin-card h2 { margin: 0 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--muted); }
.spin-boot { color: var(--muted); padding: 32px; text-align: center; }
.spin-kv { display: grid; grid-template-columns: 140px 1fr; gap: 6px 16px; margin: 0; }
.spin-kv dt { color: var(--muted); }
.spin-kv dd { margin: 0; }
.spin-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }
.spin-dot--ok { background: var(--ok); }
.spin-dot--warn { background: var(--warn); }
.spin-dot--bad { background: var(--bad); }
`;
