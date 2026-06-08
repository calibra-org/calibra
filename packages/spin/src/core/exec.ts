import { spawn } from "node:child_process";

/**
 * Subprocess primitives built on Node's `child_process` (no `execa` dependency).
 *  - {@link run} is the foreground provisioning primitive: it inherits stdio so the operator
 *    sees docker/pnpm output live, and rejects on a non-zero exit.
 *  - {@link capture} pipes and collects output and NEVER rejects on a non-zero exit — it returns
 *    the exit code so callers (compose ps, probes) can branch on it.
 */

export interface RunOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
}

export interface CaptureResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

/** Run a command in the foreground (inherited stdio), rejecting on a non-zero exit. */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, stdio: "inherit" });
        child.once("error", reject);
        child.once("exit", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
        });
    });
}

/** Run a command capturing stdout/stderr; resolves with the exit code (never rejects). */
export function capture(cmd: string, args: string[], opts: RunOptions = {}): Promise<CaptureResult> {
    return new Promise((resolve) => {
        const child = spawn(cmd, args, {
            cwd: opts.cwd,
            env: opts.env ?? process.env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        child.stderr?.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });
        child.once("error", (err) => resolve({ stdout, stderr: stderr || String(err), exitCode: 1 }));
        child.once("close", (code) => resolve({ stdout, stderr, exitCode: code ?? 0 }));
    });
}
