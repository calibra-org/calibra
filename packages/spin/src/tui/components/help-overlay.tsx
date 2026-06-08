import { Box, Text } from "ink";

import { theme } from "../theme";

const KEYS: Array<[string, string]> = [
    ["j / k  ↑ / ↓", "move selection"],
    ["enter", "open sandbox (in the list)"],
    ["l", "tail the selected row's log"],
    ["tab", "toggle focus list ↔ logs"],
    ["r", "restart the selected service (confirm)"],
    ["o", "open the selected URL in a browser"],
    ["esc", "back to the sandbox list"],
    ["?", "toggle this help"],
    ["q / ctrl-c", "quit"],
];

/** Full-screen help overlay (toggled with `?`). */
export function HelpOverlay() {
    return (
        <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={1}>
            <Text color={theme.accent} bold>
                spin term — keys
            </Text>
            {KEYS.map(([key, desc]) => (
                <Text key={key}>
                    <Text color={theme.title}>{key.padEnd(16)}</Text>
                    <Text color={theme.muted}>{desc}</Text>
                </Text>
            ))}
        </Box>
    );
}
