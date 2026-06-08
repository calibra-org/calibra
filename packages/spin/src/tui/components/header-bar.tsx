import { Box, Text } from "ink";

import type { SandboxSnapshot } from "../../core/snapshot-types";
import { theme } from "../theme";

/** Top bar: tool name, sandbox slug + branch, and the up/total + run-state summary. */
export function HeaderBar({ snapshot, slug }: { snapshot: SandboxSnapshot | null; slug: string | null }) {
    const up = snapshot ? snapshot.services.filter((s) => s.status === "up").length : 0;
    const total = snapshot ? snapshot.services.length : 0;
    return (
        <Box justifyContent="space-between" borderStyle="round" borderColor={theme.muted} paddingX={1}>
            <Text>
                <Text color={theme.accent} bold>
                    spin
                </Text>{" "}
                <Text color={theme.title}>{snapshot?.slug ?? slug ?? "—"}</Text>{" "}
                <Text color={theme.muted}>{snapshot?.branch ?? ""}</Text>
            </Text>
            <Text>
                {snapshot && snapshot.run.kind !== "none" ? (
                    <Text color={snapshot.run.kind === "failed" ? theme.down : theme.warn}>{snapshot.run.kind} </Text>
                ) : null}
                <Text color={up === total && total > 0 ? theme.ok : theme.warn}>
                    {up}/{total} up
                </Text>
            </Text>
        </Box>
    );
}
