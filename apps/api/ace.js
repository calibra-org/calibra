/**
 * JavaScript entrypoint for `node ace …`. Registers the `@poppinss/ts-exec` JIT compiler so
 * `bin/console.ts` can be loaded directly from source. v7 replaced the legacy
 * `ts-node-maintained/register/esm` hook with this lighter ESM loader.
 *
 * @see https://docs.adonisjs.com/guides/typescript-build-process#creating-production-build
 */

import "@poppinss/ts-exec";

await import("./bin/console.js");
