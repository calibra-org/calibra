import { Box, Text } from "ink";

import { cell } from "../format";
import type { SandboxRow } from "../hooks/use-sandboxes";
import { theme } from "../theme";

function statusColor(status: SandboxRow["status"]): string {
    if (status === "running") return theme.ok;
    if (status === "stopped") return theme.muted;
    if (status === "failed") return theme.down;
    return theme.warn;
}

/** The sandbox picker — every provisioned spin with its status + key ports. */
export function SandboxList({ rows, selected }: { rows: SandboxRow[]; selected: number }) {
    return (
        <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor={theme.muted} paddingX={1}>
            <Text color={theme.muted}>
                {cell("SANDBOX", 22)} {cell("STATUS", 12)} ADMIN API
            </Text>
            {rows.length === 0 ? <Text color={theme.muted}>{"(no spins — run `pnpm spin <slug>`)"}</Text> : null}
            {rows.map((row, index) => {
                const active = index === selected;
                return (
                    <Text key={row.slug} inverse={active}>
                        {active ? "▸ " : "  "}
                        <Text color={theme.title}>{cell(row.slug, 20)}</Text>{" "}
                        <Text color={statusColor(row.status)}>{cell(row.status, 12)}</Text> {row.admin} {row.api}
                    </Text>
                );
            })}
        </Box>
    );
}
