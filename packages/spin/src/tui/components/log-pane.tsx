import { Box, Text } from "ink";
import { theme } from "../theme";

/** Tail pane for the selected service's log. Shows the last `height` lines (Ink doesn't scroll). */
export function LogPane({ name, lines, focused, height = 14 }: { name: string; lines: string[]; focused: boolean; height?: number }) {
    const visible = lines.slice(-height);
    return (
        <Box flexDirection="column" borderStyle="round" borderColor={focused ? theme.accent : theme.muted} paddingX={1}>
            <Text color={theme.accent}>logs: {name}</Text>
            {visible.length === 0 ? <Text color={theme.muted}>waiting for output…</Text> : null}
            {visible.map((line, index) => (
                <Text key={`${index}-${line.slice(0, 8)}`} wrap="truncate-end">
                    {line || " "}
                </Text>
            ))}
        </Box>
    );
}
