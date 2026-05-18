/**
 * Public route table. Versioned under `/api/v1` so we can ship breaking changes behind `/api/v2`
 * without rewriting consumer apps. Liveness probe lives at `/health` (unversioned).
 *
 * Per-domain route files (one per phase) are added under `start/routes/` and loaded here as the
 * commerce backend is built out — see `docs/phases/01-foundation.md`.
 */

import router from "@adonisjs/core/services/router";

router.get("/health", async () => ({ status: "ok" }));
