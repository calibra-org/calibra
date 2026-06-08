import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { platform } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";

import { capture, run } from "../core/exec";
import { SHARED_CADDY_CA_DIR, STATE_DIR } from "../core/paths";
import { log } from "../log";

/**
 * Install Caddy's local root CA into the OS trust store so `https://*.spin.localhost` shows a green
 * lock. The CA is host-bound (the compose file mounts `~/.calibra/caddy-ca` into Caddy's
 * `pki/authorities/local`), so the root cert lives on the host at `~/.calibra/caddy-ca/root.crt` —
 * no container exec needed. Trusting it once is permanent across every spin. Untrusted TLS is a
 * common cause of "multi-tenant looks broken" (browser warnings mistaken for tenancy bugs).
 */

const HOST_ROOT_CRT = join(SHARED_CADDY_CA_DIR, "root.crt");

function isWsl(): boolean {
    try {
        return readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft");
    } catch {
        return false;
    }
}

function printManualInstructions(certPath: string): void {
    log.info("Trust the CA manually:");
    log.info(
        `  Linux:   sudo cp ${certPath} /usr/local/share/ca-certificates/calibra-spin-root.crt && sudo update-ca-certificates`,
    );
    log.info(`  macOS:   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${certPath}`);
    log.info(`  Windows: certutil -user -addstore Root <path>   (from PowerShell, with the cert copied out of WSL)`);
    log.info("  Firefox/Chrome may use their own store — import the cert there too if you still see warnings.");
}

async function installCert(certPath: string): Promise<void> {
    const os = platform();
    if (os === "linux") {
        log.step("trust: installing into the system store (sudo)");
        await run("sudo", ["cp", certPath, "/usr/local/share/ca-certificates/calibra-spin-root.crt"]);
        await run("sudo", ["update-ca-certificates"]);
        log.success("installed into the Linux system store");
        if (isWsl()) {
            log.step("trust: also importing into the Windows store (WSL)");
            const winPath = (await capture("wslpath", ["-w", certPath])).stdout.trim();
            const result = await capture("certutil.exe", ["-user", "-addstore", "Root", winPath]);
            if (result.exitCode === 0) log.success("imported into the Windows user Root store");
            else log.warn(`Windows import skipped (${result.stderr.trim() || "certutil failed"}); import manually if needed`);
        }
        return;
    }
    if (os === "darwin") {
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
        return;
    }
    log.warn(`automatic install not supported on "${os}"`);
    printManualInstructions(certPath);
}

export async function runTrust(opts: { install?: boolean }): Promise<void> {
    if (!existsSync(HOST_ROOT_CRT)) {
        throw new Error(
            `Caddy root CA not found at ${HOST_ROOT_CRT} — start a spin first (the CA is minted on Caddy's first boot).`,
        );
    }
    const cert = readFileSync(HOST_ROOT_CRT, "utf8");
    await mkdir(STATE_DIR, { recursive: true });
    const out = join(STATE_DIR, "caddy-root.crt");
    await writeFile(out, cert);
    log.success(`Caddy root CA at ${out}`);

    if (opts.install) {
        await installCert(out);
    } else {
        printManualInstructions(out);
        log.info("Or re-run with --install to do it automatically.");
    }
}

export function registerTrust(program: Command): void {
    program
        .command("trust")
        .description("install Caddy's local root CA so https://*.spin.localhost is trusted")
        .option("--install", "install into the OS trust store automatically (uses sudo)")
        .action(async (opts: { install?: boolean }) => {
            await runTrust(opts);
        });
}
