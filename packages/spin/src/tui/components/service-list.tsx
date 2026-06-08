import { Box, Text } from "ink";

import { cell } from "../format";
import type { TuiRow } from "../rows";
import { healthColor, healthGlyph, theme } from "../theme";

/** The selectable services + tenants list. Dims when focus is on the log pane. */
export function ServiceList({ rows, selected, focused }: { rows: TuiRow[]; selected: number; focused: boolean }) {
    let lastKind: TuiRow["kind"] | null = null;
    return (
        <Box
            flexDirection="column"
            flexGrow={1}
            borderStyle="round"
            borderColor={focused ? theme.accent : theme.muted}
            paddingX={1}
        >
            {rows.map((row, index) => {
                const active = index === selected;
                const separator = row.kind !== lastKind && row.kind === "tenant";
                lastKind = row.kind;
                return (
                    <Box flexDirection="column" key={row.key}>
                        {separator ? <Text color={theme.muted}>── shops ──</Text> : null}
                        <Text inverse={active && focused} dimColor={!focused}>
                            {active ? "▸ " : "  "}
                            <Text color={healthColor(row.status)}>{healthGlyph(row.status)} </Text>
                            <Text color={theme.title}>{cell(row.label, 22)}</Text>
                            <Text color={theme.muted}>{row.url ?? ""}</Text>
                        </Text>
                    </Box>
                );
            })}
        </Box>
    );
}
