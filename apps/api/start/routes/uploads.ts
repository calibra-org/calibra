import { promises as fs } from "node:fs";
import router from "@adonisjs/core/services/router";

import { resolveServePath } from "#services/media_storage";

/**
 * Public read-only route that streams files persisted by the media library back to the browser.
 * Sits outside `/api/v1/admin` deliberately — `<img src>` consumers (the storefront, the admin
 * grid, downstream brand/category inspectors) shouldn't have to send bearer tokens just to
 * render a thumbnail.
 *
 * Path traversal is rejected by {@link resolveServePath}, so callers can't escape the storage
 * root regardless of how they encode `..`. Missing files return 404 cleanly rather than 500.
 */
router.get("/uploads/*", async ({ params, response }) => {
    const segments = Array.isArray(params["*"]) ? (params["*"] as string[]) : [];
    const absolute = resolveServePath(segments);
    if (absolute === null) return response.status(400).json({ error: "bad_path" });
    try {
        await fs.access(absolute);
    } catch {
        return response.status(404).json({ error: "not_found" });
    }
    return response.download(absolute);
});
