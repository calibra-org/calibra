import { Box, Text } from "ink";

import type { TuiRow } from "../rows";
import { healthColor, theme } from "../theme";

/** Side pane showing the fields of the selected service/tenant row. */
export function DetailPane({ row }: { row: TuiRow | null }) {
    return (
        <Box flexDirection="column" width={38} borderStyle="round" borderColor={theme.muted} paddingX={1}>
            <Text color={theme.accent}>detail</Text>
            {row ? (
                <>
                    <Text>
                        <Text color={theme.muted}>name </Text>
                        {row.label}
                    </Text>
                    <Text>
                        <Text color={theme.muted}>kind </Text>
                        {row.kind}
                    </Text>
                    <Text>
                        <Text color={theme.muted}>state </Text>
                        <Text color={healthColor(row.status)}>{row.status}</Text>
                    </Text>
                    {row.url ? (
                        <Box flexDirection="column">
                            <Text color={theme.muted}>url</Text>
                            <Text wrap="truncate-end">{row.url}</Text>
                        </Box>
                    ) : null}
                    {row.logName ? (
                        <Text>
                            <Text color={theme.muted}>log </Text>
                            {row.logName}
                        </Text>
                    ) : null}
                    <Box marginTop={1} flexDirection="column">
                        {row.logName ? <Text color={theme.muted}>l · tail log</Text> : null}
                        {row.url ? <Text color={theme.muted}>o · open in browser</Text> : null}
                        {row.restartTarget ? <Text color={theme.muted}>r · restart</Text> : null}
                    </Box>
                </>
            ) : (
                <Text color={theme.muted}>(nothing selected)</Text>
            )}
        </Box>
    );
}
