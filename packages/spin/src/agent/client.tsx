import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "./components";
import { PANEL_CSS } from "./styles";

/**
 * Browser entry for the web panel. This is the entry tsdown compiles with a catch-all
 * bundle rule, so React 19 + react-dom/client are bundled directly into the emitted
 * `dist/agent/client.js` — there is no `import "react"` left to resolve at runtime and no
 * CDN dependency. The CSS is re-injected here (in addition to the SSR-inlined copy) so a
 * style edit shows up on a plain reload during development.
 */

const style = document.createElement("style");
style.dataset.spin = "panel";
style.textContent = PANEL_CSS;
document.head.appendChild(style);

const container = document.getElementById("app");
if (container) {
    createRoot(container).render(
        <StrictMode>
            <Dashboard />
        </StrictMode>,
    );
}
