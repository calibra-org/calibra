import { Box, Text } from "ink";

import { theme } from "../theme";

/** The `/`-activated filter input shown at the bottom while filtering the row list. */
export function CommandBar({ value }: { value: string }) {
    return (
        <Box paddingX={1}>
            <Text color={theme.accent}>/</Text>
            <Text>{value}</Text>
            <Text inverse> </Text>
            <Text color={theme.muted}> (filter — enter to apply, esc to clear)</Text>
        </Box>
    );
}
