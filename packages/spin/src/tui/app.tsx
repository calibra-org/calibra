import { spawn } from "node:child_process";
import { useEffect, useState } from "react";
import { Box, useApp, useInput } from "ink";
import { serviceById } from "../core/catalog";
import { composeRestart } from "../core/compose";
import { buildComposeOptions } from "../core/compose-assembly";
import { restartHostProcess } from "../core/host-process";
import { loadMeta, type SpinMeta } from "../core/meta";
import { HeaderBar } from "./components/header-bar";
import { HelpOverlay } from "./components/help-overlay";
import { HintLine } from "./components/hint-line";
import { LogPane } from "./components/log-pane";
import { SandboxList } from "./components/sandbox-list";
import { ServiceList } from "./components/service-list";
import { useLogStream } from "./hooks/use-log-stream";
import { useSandboxes } from "./hooks/use-sandboxes";
import { useSnapshot } from "./hooks/use-snapshot";
import { buildRows } from "./rows";

/** Best-effort cross-platform "open this URL in a browser" (WSL/Linux/macOS). */
function openUrl(url: string): void {
    const child = spawn("sh", ["-c", `xdg-open '${url}' >/dev/null 2>&1 || open '${url}' >/dev/null 2>&1 || wslview '${url}' >/dev/null 2>&1`], {
        detached: true,
        stdio: "ignore",
    });
    child.unref();
}

const SANDBOX_HINTS = "j/k move · enter open · ? help · q quit";
const SERVICE_HINTS = "j/k move · l logs · tab focus · r restart · o open · esc back · ? help · q quit";

export function App({ initialSlug }: { initialSlug?: string }) {
    const { exit } = useApp();
    const sandboxes = useSandboxes();

    const [view, setView] = useState<"sandboxes" | "services">(initialSlug ? "services" : "sandboxes");
    const [sandboxSel, setSandboxSel] = useState(0);
    const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug ?? null);
    const [meta, setMeta] = useState<SpinMeta | null>(null);
    const [rowSel, setRowSel] = useState(0);
    const [focus, setFocus] = useState<"list" | "logs">("list");
    const [logName, setLogName] = useState<string | null>(null);
    const [showHelp, setShowHelp] = useState(false);
    const [confirm, setConfirm] = useState<{ target: string; label: string } | null>(null);
    const [status, setStatus] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedSlug) {
            setMeta(null);
            return;
        }
        let active = true;
        void loadMeta(selectedSlug).then((loaded) => {
            if (active) setMeta(loaded);
        });
        return () => {
            active = false;
        };
    }, [selectedSlug]);

    const snapshot = useSnapshot(view === "services" ? meta : null);
    const logLines = useLogStream(meta, view === "services" ? logName : null);
    const rows = snapshot ? buildRows(snapshot) : [];
    const selectedRow = rows[Math.min(rowSel, Math.max(0, rows.length - 1))] ?? null;

    async function doRestart(target: string): Promise<void> {
        if (!meta) return;
        const def = serviceById(target);
        setStatus(`restarting ${target}…`);
        try {
            if (def?.kind === "container" && def.composeService) {
                await composeRestart(buildComposeOptions(meta), [def.composeService]);
            } else {
                await restartHostProcess(meta.worktreePath, target);
            }
            setStatus(`restarted ${target}`);
        } catch (err) {
            setStatus(`restart failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    useInput((input, key) => {
        if (showHelp) {
            setShowHelp(false);
            return;
        }
        if (confirm) {
            if (input === "y") {
                void doRestart(confirm.target);
            }
            setConfirm(null);
            return;
        }
        if (input === "q" || (key.ctrl && input === "c")) {
            exit();
            return;
        }
        if (input === "?") {
            setShowHelp(true);
            return;
        }

        if (view === "sandboxes") {
            if (input === "j" || key.downArrow) setSandboxSel((i) => Math.min(i + 1, Math.max(0, sandboxes.length - 1)));
            else if (input === "k" || key.upArrow) setSandboxSel((i) => Math.max(i - 1, 0));
            else if (key.return && sandboxes[sandboxSel]) {
                setSelectedSlug(sandboxes[sandboxSel]!.slug);
                setView("services");
                setRowSel(0);
                setStatus(null);
            }
            return;
        }

        /** services view */
        if (key.escape) {
            setView("sandboxes");
            setLogName(null);
            setFocus("list");
            return;
        }
        if (key.tab) {
            setFocus((f) => (f === "list" ? "logs" : "list"));
            return;
        }
        if (input === "j" || key.downArrow) setRowSel((i) => Math.min(i + 1, Math.max(0, rows.length - 1)));
        else if (input === "k" || key.upArrow) setRowSel((i) => Math.max(i - 1, 0));
        else if (input === "l" && selectedRow?.logName) {
            setLogName(selectedRow.logName);
            setFocus("logs");
        } else if (input === "o" && selectedRow?.url?.startsWith("http")) {
            openUrl(selectedRow.url);
            setStatus(`opening ${selectedRow.url}`);
        } else if (input === "r" && selectedRow?.restartTarget) {
            setConfirm({ target: selectedRow.restartTarget, label: `restart ${selectedRow.label}?` });
        }
    });

    return (
        <Box flexDirection="column">
            <HeaderBar snapshot={snapshot} slug={selectedSlug} />
            {view === "sandboxes" ? (
                <SandboxList rows={sandboxes} selected={sandboxSel} />
            ) : (
                <>
                    <ServiceList rows={rows} selected={Math.min(rowSel, Math.max(0, rows.length - 1))} focused={focus === "list"} />
                    {logName ? <LogPane name={logName} lines={logLines} focused={focus === "logs"} /> : null}
                </>
            )}
            {showHelp ? <HelpOverlay /> : <HintLine hints={view === "sandboxes" ? SANDBOX_HINTS : SERVICE_HINTS} status={status} confirm={confirm?.label ?? null} />}
        </Box>
    );
}
