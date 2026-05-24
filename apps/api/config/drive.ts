import app from "@adonisjs/core/services/app";
import { defineConfig, services } from "@adonisjs/drive";

/**
 * Two private disks back the CSV importer + exporter:
 *  - `imports`  → uploaded CSVs, pre-import snapshots, error-report CSVs
 *  - `exports`  → generated CSV/JSON payloads and their gzipped variants
 *
 * Both are `fs`-backed (no S3 credentials in this repo) and `visibility: "private"` — files are
 * never served via Drive's HTTP file server, only streamed through authenticated controller
 * endpoints. That's why `serveFiles` stays off.
 *
 * The `default` field is required by Drive's type system; it points at `imports` so a stray
 * `drive.use()` (no disk argument) doesn't silently blow up — every site in this codebase that
 * cares about the right disk passes its name explicitly (`drive.use("imports")` /
 * `drive.use("exports")`).
 */
const driveConfig = defineConfig({
    default: "imports",
    services: {
        imports: services.fs({
            location: app.makePath("storage", "imports"),
            visibility: "private",
        }),
        exports: services.fs({
            location: app.makePath("storage", "exports"),
            visibility: "private",
        }),
    },
});

export default driveConfig;

declare module "@adonisjs/drive/types" {
    export interface DriveDisks extends InferDriveDisks<typeof driveConfig> {}
}
