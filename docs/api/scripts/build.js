import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "dist");
const REF_DIR = join(ROOT, "reference");
const SPEC_DIR = join(REF_DIR, "openapi");
const SRC_HTML = join(REF_DIR, "scalar", "index.html");

const SPECS = ["storefront.v1.yaml", "admin.v1.yaml", "platform.v1.yaml"];

main();
function main() {
    SPECS.forEach((spec) => {
        buildSpec(join(SPEC_DIR, spec), join(OUT_DIR, spec));
    });
    copyIndex();
}

function buildSpec(source, output) {
    try {
        execSync(`pnpm redocly bundle ${source} -o ${output}`, { stdio: "inherit" });
        console.log(`✓ Built ${source} to ${output}`);
    } catch (err) {
        console.error(`✗ Building ${source} failed:`, err.message);
        process.exit(1);
    }
}

function copyIndex() {
    try {
        mkdirSync(OUT_DIR, { recursive: true });
        copyFileSync(SRC_HTML, join(OUT_DIR, "index.html"));
        console.log("✓ Copied index.html to dist/");
    } catch (err) {
        console.error("✗ Copy failed:", err.message);
        process.exit(1);
    }
}
