/**
 * JavaScript entrypoint for `node ace …`. We can't run TypeScript directly through `node`, so this
 * file registers the `ts-node-maintained/register/esm` hook and then imports the real entrypoint
 * at `bin/console.ts` (resolved as `.js` because the hook handles the source mapping).
 *
 * @see https://docs.adonisjs.com/guides/typescript-build-process#creating-production-build
 */

import "ts-node-maintained/register/esm";

await import("./bin/console.js");
