#!/bin/bash
# PreToolUse hook: block `npm install`, `npm i`, and `npm add` so agents do
# not accidentally write a `package-lock.json` into this pnpm-managed repo.
# Everything else (yarn, bun, npx, other npm subcommands) is unchanged.

set -euo pipefail

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Scan each pipeline segment so `cd foo && npm install`, `(npm i)`, etc. are caught.
NORMALIZED=$(printf '%s' "$COMMAND" | tr ';|&()`' '\n' | sed -E 's/\$\(/\n/g')

while IFS= read -r segment; do
  trimmed=$(printf '%s' "$segment" | sed -E 's/^[[:space:]]+//; s/^(sudo[[:space:]]+)+//; s/^([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)+//')

  case "$trimmed" in
    "npm install"*|"npm i "*|"npm i"|"npm add"*)
      echo "Blocked by .claude/hooks/enforce-pnpm.sh: this repo is pnpm-only." >&2
      echo "Use: pnpm ${trimmed#npm }" >&2
      exit 2
      ;;
  esac
done <<< "$NORMALIZED"

exit 0
