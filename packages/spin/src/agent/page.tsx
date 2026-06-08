import { renderToStaticMarkup } from "react-dom/server";

import { PANEL_CSS } from "./styles";

/**
 * Server-rendered shell for the panel. This is a **non-hydrating** SSR document: it ships
 * the CSS inline, a boot placeholder, and exactly one `<script type="module" src="/client.js">`
 * that boots the bundled-React app. We render to *static* markup (not `renderToString`) on
 * purpose — the client `createRoot` mounts fresh into `#app` rather than hydrating, which
 * keeps the shell trivially correct and avoids hydration-mismatch warnings for a dev tool.
 */

interface ShellProps {
    slug: string;
}

function Shell({ slug }: ShellProps) {
    return (
        <html lang="en">
            {/* biome-ignore lint/style/noHeadElement: standalone SSR shell, not a Next.js app */}
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>{`spin · ${slug}`}</title>
                {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted first-party CSS inlined into the shell */}
                <style dangerouslySetInnerHTML={{ __html: PANEL_CSS }} />
                <link rel="modulepreload" href="/client.js" />
            </head>
            <body>
                <div id="app" data-slug={slug}>
                    <div className="spin-boot">booting spin panel…</div>
                </div>
                <script type="module" src="/client.js" />
            </body>
        </html>
    );
}

/** Render the full HTML document string served by `GET /`. */
export function renderDashboardHtml(opts: ShellProps): string {
    return `<!doctype html>\n${renderToStaticMarkup(<Shell slug={opts.slug} />)}`;
}
