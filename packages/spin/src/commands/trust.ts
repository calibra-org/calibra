import type { Command } from "commander";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { platform } from "node:os";
import { join } from "node:path";

import { capture, run } from "../core/exec";
import { SHARED_CADDY_CA_DIR, STATE_DIR } from "../core/paths";
import { log } from "../log";

/**
 * Install Caddy's local root CA into the OS trust store so `https://*.calibra.localhost` shows a
 * green lock. The compose file mounts `~/.calibra/caddy-ca` into Caddy's `pki/authorities/local`,
 * so one root signs every spin on this host — trusting it once covers every future spin, and it
 * survives `spin stop --purge` (which only drops per-spin volumes).
 *
 * Untrusted TLS is a common cause of "multi-tenancy looks broken": the browser interstitial gets
 * mistaken for a tenancy bug.
 */

const HOST_ROOT_CRT = join(SHARED_CADDY_CA_DIR, "root.crt");

/** Image used only to read the root-owned CA back out of the shared mount. Already pulled by every spin. */
const CA_READER_IMAGE = "caddy:2.8-alpine";

function isWsl(): boolean {
    try {
        return readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft");
    } catch {
        return false;
    }
}

/**
 * Read the root CA without requiring host `sudo`.
 *
 * Caddy writes the CA as root inside the container, so on the host it lands `-rw------- root` and a
 * plain read fails with `EACCES` for the developer running spin. Rather than escalate, read it back
 * through a throwaway container that mounts the same directory — the container's root can read what
 * the container's root wrote. The direct read is still tried first for hosts where the ownership
 * happens to line up (rootless Docker, userns remapping).
 */
async function readRootCa(): Promise<string> {
    if (!existsSync(SHARED_CADDY_CA_DIR)) {
        throw new Error(
            `Caddy CA directory not found at ${SHARED_CADDY_CA_DIR} — start a spin first (the CA is minted on Caddy's first boot).`,
        );
    }
    try {
        return readFileSync(HOST_ROOT_CRT, "utf8");
    } catch {
        log.debug("trust: direct read failed (root-owned); reading through a container instead");
    }

    const result = await capture("docker", [
        "run",
        "--rm",
        "-v",
        `${SHARED_CADDY_CA_DIR}:/ca:ro`,
        CA_READER_IMAGE,
        "cat",
        "/ca/root.crt",
    ]);
    if (result.exitCode !== 0 || !result.stdout.includes("BEGIN CERTIFICATE")) {
        throw new Error(
            `could not read ${HOST_ROOT_CRT}. It is owned by root (Caddy writes it from inside the container) and the container fallback failed: ${result.stderr.trim() || "no certificate on stdout"}. Start a spin, or read it manually with \`sudo cat ${HOST_ROOT_CRT}\`.`,
        );
    }
    return result.stdout;
}

/** Windows cert stores are keyed by SHA-1 thumbprint, uppercase hex, no separators. */
function thumbprint(pem: string): string {
    const body = pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
    return createHash("sha1").update(Buffer.from(body, "base64")).digest("hex").toUpperCase();
}

async function powershell(script: string): Promise<string> {
    const result = await capture("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
    return result.stdout.replace(/\r/g, "").trim();
}

async function isTrustedOnWindows(thumb: string): Promise<boolean> {
    const out = await powershell(
        `if (Get-ChildItem Cert:\\CurrentUser\\Root | Where-Object { $_.Thumbprint -eq '${thumb}' }) { 'yes' } else { 'no' }`,
    );
    return out === "yes";
}

/**
 * Import into the Windows **CurrentUser** root store. That store needs no elevation and is the one
 * Chrome and Edge read, which is what matters here: the stack runs in WSL but the browser is a
 * Windows process, so trusting the CA inside WSL alone leaves the browser still showing
 * `ERR_CERT_AUTHORITY_INVALID`.
 *
 * The cert is staged into the Windows `%TEMP%` first. `wslpath -w` produces a `\\wsl.localhost\…`
 * UNC path, which `certutil` frequently cannot read.
 */
async function installOnWindows(pem: string): Promise<void> {
    const thumb = thumbprint(pem);
    if (await isTrustedOnWindows(thumb)) {
        log.success(`already trusted on Windows (thumbprint ${thumb})`);
        return;
    }

    const winTemp = await powershell("Write-Output $env:TEMP");
    if (winTemp === "") throw new Error("could not resolve the Windows %TEMP% directory via powershell.exe");
    const stagedWsl = (await capture("wslpath", ["-u", winTemp])).stdout.trim();
    await writeFile(join(stagedWsl, "calibra-root-ca.crt"), pem);

    log.step("trust: importing into the Windows CurrentUser root store");
    const result = await capture("certutil.exe", ["-user", "-addstore", "-f", "Root", `${winTemp}\\calibra-root-ca.crt`]);
    if (result.exitCode !== 0) {
        throw new Error(`certutil failed: ${(result.stderr || result.stdout).replace(/\r/g, "").trim()}`);
    }

    if (!(await isTrustedOnWindows(thumb))) {
        throw new Error("certutil reported success but the certificate is not in Cert:\\CurrentUser\\Root — import it manually.");
    }
    log.success(`trusted on Windows (thumbprint ${thumb}) — restart the browser to pick it up`);
}

async function installOnLinux(certPath: string): Promise<void> {
    log.step("trust: installing into the Linux system store (sudo)");
    await run("sudo", ["cp", certPath, "/usr/local/share/ca-certificates/calibra-root.crt"]);
    await run("sudo", ["update-ca-certificates"]);
    log.success("installed into the Linux system store");
}

async function installOnMac(certPath: string): Promise<void> {
    log.step("trust: installing into the macOS System keychain (sudo)");
    await run("sudo", [
        "security",
        "add-trusted-cert",
        "-d",
        "-r",
        "trustRoot",
        "-k",
        "/Library/Keychains/System.keychain",
        certPath,
    ]);
    log.success("installed into the macOS System keychain");
}

function printManualInstructions(certPath: string): void {
    log.info("Trust the CA manually:");
    log.info(`  Linux:   sudo cp ${certPath} /usr/local/share/ca-certificates/calibra-root.crt && sudo update-ca-certificates`);
    log.info(`  macOS:   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${certPath}`);
    log.info(`  Windows: certutil -user -addstore -f Root <path>   (from PowerShell, cert copied out of WSL first)`);
    log.info("  Firefox keeps its own store — import there too if it still warns.");
}

export async function runTrust(opts: { install?: boolean }): Promise<void> {
    const pem = await readRootCa();
    await mkdir(STATE_DIR, { recursive: true });
    const out = join(STATE_DIR, "caddy-root.crt");
    await writeFile(out, pem);
    log.success(`Caddy root CA exported to ${out}`);

    /**
     * On WSL the browser is a Windows process, so the Windows store is the one that decides whether
     * the lock is green. It needs no elevation, so it runs by default — unlike the Linux/macOS system
     * stores, which need sudo and stay behind `--install`.
     */
    if (isWsl() && !opts.install) {
        await installOnWindows(pem);
        log.info("WSL detected — the Windows store was updated. Pass --install to also add it to the Linux system store (sudo).");
        return;
    }

    if (!opts.install) {
        printManualInstructions(out);
        log.info("Or re-run with --install to do it automatically.");
        return;
    }

    const os = platform();
    if (os === "linux") {
        await installOnLinux(out);
        if (isWsl()) await installOnWindows(pem);
        return;
    }
    if (os === "darwin") {
        await installOnMac(out);
        return;
    }
    log.warn(`automatic install not supported on "${os}"`);
    printManualInstructions(out);
}

export function registerTrust(program: Command): void {
    program
        .command("trust")
        .description("install Caddy's local root CA so https://*.calibra.localhost is trusted (WSL: updates the Windows store)")
        .option("--install", "also install into the OS system store (uses sudo on Linux/macOS)")
        .action(async (opts: { install?: boolean }) => {
            await runTrust(opts);
        });
}
