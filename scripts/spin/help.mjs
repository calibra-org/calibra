// @ts-check

import { bold, cyan } from "./log.mjs";

export function printHelp() {
    process.stdout.write(`
${bold("pnpm spin")} — isolated dev environments + investigation toolkit

${bold("Provision")}
  pnpm spin ${cyan("<slug>")}                start (or resume) a worktree-based spin
  pnpm spin start ${cyan("<slug>")} [flags]
  pnpm spin local [start|stop|status]  in-place spin against the current checkout
                                       (no worktree, no branch, no PR)
  pnpm spin pr ${cyan("<slug>")}             open the draft PR for a --no-pr spin

${bold("Inspect")}
  pnpm spin list [--json]              every spin's status + ports
  pnpm spin doctor ${cyan("<slug>")} [--json] per-service health for one spin
  pnpm spin url ${cyan("<slug>")} [service]   print one URL to stdout (default: dashboard)
  pnpm spin logs ${cyan("<slug>")} [stream]   print the absolute log path (default: api.ndjson)
  pnpm spin metrics ${cyan("<slug>")}         curl the api's /metrics → stdout
  pnpm spin alerts ${cyan("<slug>")}          query Prometheus /api/v1/alerts → stdout

${bold("Teardown")}
  pnpm spin stop ${cyan("<slug>")} [--purge] [--remove] [--force]

${bold("Flags (start)")}
  --with-web    also start the storefront on the allocated web port
  --no-pr       skip opening the draft PR (call \`pnpm spin pr\` later)

${bold("Flags (stop)")}
  --purge       also delete the docker volumes (wipes the seeded DB)
  --remove      delete the worktree directory and branch after stopping
  --force       allow --remove even with uncommitted changes / unpushed commits

${bold("Slug rules")}
  lowercase letters, digits, dashes; 2–40 chars. \`local\` is reserved for in-place spins.

Docs: scripts/spin.md · Issue: https://github.com/calibra-org/calibra/issues/21
`);
}
