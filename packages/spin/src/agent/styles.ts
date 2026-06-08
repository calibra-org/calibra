/**
 * Hand-written CSS for the web panel, exported as a string so it can be both inlined into the SSR
 * shell ({@link "./page"}) and re-injected on the client ({@link "./client"}). A dev tool,
 * deliberately *not* Tailwind/panel-kit — the panel renders with zero build coupling to the apps it
 * inspects. The palette tracks GitHub dark.
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
code { font-family: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace; font-size: 0.9em; }
.spin-shell { max-width: 1120px; margin: 0 auto; padding: 24px clamp(16px, 4vw, 40px); display: flex; flex-direction: column; gap: 16px; }
.spin-header { display: flex; align-items: baseline; gap: 10px; border-bottom: 1px solid var(--border); padding-bottom: 16px; }
.spin-header strong { font-size: 18px; letter-spacing: 0.5px; }
.spin-badge { font-size: 12px; color: var(--fg); background: var(--panel-2); border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; }
.spin-dim { color: var(--muted); }
.spin-warn { color: var(--warn); border-color: var(--warn); }
.spin-bad { color: var(--bad); border-color: var(--bad); }
.spin-card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px 20px; }
.spin-card h2 { margin: 0 0 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.7px; color: var(--muted); }
.spin-boot { color: var(--muted); padding: 40px; text-align: center; }
.spin-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 7px; flex: 0 0 auto; }
.spin-dot--ok { background: var(--ok); }
.spin-dot--warn { background: var(--warn); }
.spin-dot--bad { background: var(--bad); }
.spin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.spin-tenant { background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 4px; }
.spin-tenant__head { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.spin-svc-group { margin-bottom: 14px; }
.spin-svc-group__title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--muted); margin-bottom: 6px; }
.spin-svc-group__items { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 4px 16px; }
.spin-svc { display: flex; align-items: center; gap: 2px; padding: 3px 0; }
.spin-svc__note { margin-left: 8px; font-size: 12px; }
.spin-log-bar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.spin-chip { background: var(--panel-2); color: var(--muted); border: 1px solid var(--border); border-radius: 6px; padding: 3px 9px; font-size: 12px; cursor: pointer; font-family: inherit; }
.spin-chip:hover { color: var(--fg); }
.spin-chip--on { background: var(--accent); color: #fff; border-color: var(--accent); }
.spin-log { background: #010409; border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin: 0; max-height: 360px; overflow: auto; font-family: ui-monospace, Menlo, monospace; font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.spin-log--action { max-height: 220px; margin-top: 12px; }
.spin-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.spin-action-row { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); }
.spin-action-row select { background: var(--panel-2); color: var(--fg); border: 1px solid var(--border); border-radius: 6px; padding: 3px 6px; font-family: inherit; }
.spin-btn { background: var(--panel-2); color: var(--fg); border: 1px solid var(--border); border-radius: 6px; padding: 4px 12px; font-size: 13px; cursor: pointer; font-family: inherit; }
.spin-btn:hover { border-color: var(--accent); }
.spin-btn--danger { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 50%, var(--border)); }
.spin-btn--danger:hover { border-color: var(--bad); }
.spin-confirm { display: inline-flex; align-items: center; gap: 6px; color: var(--warn); font-size: 13px; }
.spin-copy { background: var(--panel-2); color: var(--muted); border: 1px solid var(--border); border-radius: 4px; padding: 1px 7px; font-size: 11px; cursor: pointer; font-family: inherit; margin-left: 4px; }
.spin-copy:hover { color: var(--fg); border-color: var(--accent); }
.spin-creds { list-style: none; padding: 0; margin: 8px 0 0; display: flex; flex-direction: column; gap: 4px; }
.spin-creds code { color: var(--accent); }
.spin-key { word-break: break-all; color: var(--accent); }
a.spin-tenant { color: var(--fg); }
a.spin-tenant:hover { border-color: var(--accent); text-decoration: none; }
`;
