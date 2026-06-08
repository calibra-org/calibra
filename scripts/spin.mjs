#!/usr/bin/env node

/**
 * Thin entrypoint for `pnpm spin`. The implementation lives in `@calibra/spin`
 * (`packages/spin`); `dist/cli.js` is built by that package's `prepare` hook on `pnpm install`,
 * so a fresh clone runs `pnpm spin` with no manual build. The CLI parses `process.argv` on import.
 */
import("../packages/spin/dist/cli.js").catch((error) => {
    console.error(error);
    process.exit(1);
});
