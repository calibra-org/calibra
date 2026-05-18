import { defineConfig } from "@adonisjs/cors";

import env from "#start/env";

/**
 * CORS policy. `ALLOWED_ORIGINS` is a comma-separated allowlist (e.g.
 * `http://localhost:3000,http://localhost:3001`); falls back to `*` in development for convenience.
 *
 * @see https://docs.adonisjs.com/guides/security/cors
 */
const allowedOrigins = (env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const corsConfig = defineConfig({
    enabled: true,
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
    headers: true,
    exposeHeaders: ["Cart-Token"],
    credentials: true,
    maxAge: 90,
});

export default corsConfig;
