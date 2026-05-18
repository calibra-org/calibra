#!/bin/bash
# PreToolUse hook: when a `pnpm add ...` command names any package missing from
# `pnpm-workspace.yaml` `catalogs.default`, emit a `permissionDecision: "ask"`
# JSON so Claude Code prompts the human for confirmation. The model cannot
# auto-approve — the developer either edits the catalog first and retries, or
# explicitly overrides for a legitimate one-off.
# Pairs with the AGENTS.md "Dependencies" rule — every dep goes through the catalog.

set -euo pipefail

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
    exit 0
fi

WORKSPACE_YAML="${CLAUDE_PROJECT_DIR:-.}/pnpm-workspace.yaml"
if [ ! -f "$WORKSPACE_YAML" ]; then
    exit 0
fi

# Split into pipeline segments so `cd foo && pnpm add bar`, `(pnpm add bar)`, etc. are caught.
NORMALIZED=$(printf '%s' "$COMMAND" | tr ';|&()`' '\n' | sed -E 's/\$\(/\n/g')

missing_packages=()

while IFS= read -r segment; do
    trimmed=$(printf '%s' "$segment" | sed -E 's/^[[:space:]]+//; s/^(sudo[[:space:]]+)+//; s/^([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)+//')
    case "$trimmed" in
        "pnpm add "*|"pnpm "*" add "*) ;;
        *) continue ;;
    esac

    # Strip everything up to and including the `add` token, leaving the args.
    args=$(printf '%s' "$trimmed" | sed -E 's/^pnpm[[:space:]]+([^[:space:]]+[[:space:]]+)*add[[:space:]]+//')

    # Walk argv: skip flags and their values; collect bare package names.
    skip_next=0
    for token in $args; do
        if [ "$skip_next" -eq 1 ]; then
            skip_next=0
            continue
        fi
        case "$token" in
            -F|--filter|-w|--workspace|--workspace-root)
                skip_next=1
                continue
                ;;
            -*) continue ;;
        esac

        # Drop `catalog:` references — already aligned with the catalog by definition.
        case "$token" in
            catalog:*) continue ;;
        esac

        # Strip version suffix: foo@1.2.3 -> foo; @scope/foo@1.2.3 -> @scope/foo.
        if [[ "$token" == @*/* ]]; then
            pkg=$(printf '%s' "$token" | sed -E 's|^(@[^/]+/[^@]+).*|\1|')
        else
            pkg=$(printf '%s' "$token" | sed -E 's|^([^@]+).*|\1|')
        fi
        [ -z "$pkg" ] && continue

        # `catalogs.default` keys appear under the `default:` block, either as
        # quoted (`"@scope/pkg":`) or unquoted (`viem:`) YAML keys.
        if ! awk -v pkg="$pkg" '
            /^[[:space:]]*default:[[:space:]]*$/ { in_default=1; next }
            in_default {
                # Leave the block when we hit a line at <= 4 leading spaces that names a new key.
                if ($0 ~ /^[[:space:]]{0,4}[^[:space:]].*:[[:space:]]*$/) { in_default=0; next }
                # Strip leading whitespace, optional quotes, then read the key up to the colon.
                line=$0
                sub(/^[[:space:]]+/, "", line)
                sub(/^"/, "", line)
                key=line
                sub(/"?[[:space:]]*:.*$/, "", key)
                if (key == pkg) { found=1 }
            }
            END { exit found ? 0 : 1 }
        ' "$WORKSPACE_YAML"; then
            missing_packages+=("$pkg")
        fi
    done
done <<<"$NORMALIZED"

if [ "${#missing_packages[@]}" -gt 0 ]; then
    reason=$(printf 'Off-catalog pnpm add: %s\n\nThese packages are not in pnpm-workspace.yaml catalogs.default. The Stridge convention is to add them to the catalog first, then install via `pnpm add catalog:<pkg>` so every workspace pins through one source.\n\nProceed anyway? (Pick "yes" only if this is a deliberate override — e.g. a one-off scratch install. Otherwise cancel, edit pnpm-workspace.yaml, and rerun.)' "${missing_packages[*]}")
    jq -n --arg reason "$reason" '{
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "ask",
            permissionDecisionReason: $reason
        }
    }'
fi

exit 0
