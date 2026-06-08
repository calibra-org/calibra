import { Box, Text } from "ink";

import { theme } from "../theme";

/** Bottom keybinding hint line, or a transient status message / confirm prompt. */
export function HintLine({ hints, status, confirm }: { hints: string; status: string | null; confirm: string | null }) {
    if (confirm) {
        return (
            <Box paddingX={1}>
                <Text color={theme.warn}>{confirm} </Text>
                <Text color={theme.muted}>[y/n]</Text>
            </Box>
        );
    }
    return (
        <Box paddingX={1}>
            <Text color={theme.muted}>{status ?? hints}</Text>
        </Box>
    );
}
