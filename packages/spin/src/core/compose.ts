import { capture, run } from "./exec";

/**
 * Thin typed wrapper over `docker compose`. Every op shares {@link ComposeOptions} (project +
 * stacked `-f` files + env), so up/down/ps/restart all target the same per-spin project. Ported
 * from stridge-spin's compose layer **minus all pull-mode** (no `composePull`, no digest pinning):
 * calibra builds nothing privately, so `up` pulls public infra images directly.
 */
export interface ComposeOptions {
    /** Compose project name — every container/volume/network inherits this prefix. */
    project: string;
    /** Stacked `-f` files in declared order. */
    files: string[];
    /** Forwarded to the child process (COMPOSE_PROJECT_NAME, port substitutions, …). */
    env?: NodeJS.ProcessEnv;
}

function baseArgs(opts: ComposeOptions): string[] {
    const args = ["compose", "-p", opts.project];
    for (const file of opts.files) args.push("-f", file);
    return args;
}

/** `docker compose up -d`. Inherits stdio so the operator sees pull/create progress. */
export async function composeUp(opts: ComposeOptions, services: string[] = [], forceRecreate = false): Promise<void> {
    const args = [...baseArgs(opts), "up", "-d"];
    if (forceRecreate) args.push("--force-recreate");
    args.push(...services);
    await run("docker", args, { env: opts.env });
}

/** `docker compose down` (+ `--volumes --remove-orphans` when purging). */
export async function composeDown(opts: ComposeOptions, removeVolumes = false): Promise<void> {
    const args = [...baseArgs(opts), "down"];
    if (removeVolumes) args.push("--volumes", "--remove-orphans");
    await run("docker", args, { env: opts.env });
}

/** `docker compose stop` — keeps containers + volumes, just halts them. */
export async function composeStop(opts: ComposeOptions, services: string[] = []): Promise<void> {
    const args = [...baseArgs(opts), "stop", ...services];
    await run("docker", args, { env: opts.env });
}

/** `docker compose restart <services>` — captured so the panel can stream the result. */
export async function composeRestart(opts: ComposeOptions, services: string[]): Promise<{ ok: boolean; output: string }> {
    const result = await capture("docker", [...baseArgs(opts), "restart", ...services], { env: opts.env });
    return { ok: result.exitCode === 0, output: [result.stdout, result.stderr].filter(Boolean).join("\n") };
}

/**
 * `docker compose run --rm` a one-shot sibling container on the spin network (so it can resolve
 * other service names). `--no-deps` avoids starting dependencies; `--rm` cleans up on failure.
 */
export async function composeRunOnce(
    opts: ComposeOptions,
    service: string,
    command: string[],
    extraEnv: Record<string, string> = {},
): Promise<{ ok: boolean; output: string }> {
    const envFlags: string[] = [];
    for (const [key, value] of Object.entries(extraEnv)) envFlags.push("--env", `${key}=${value}`);
    const args = [...baseArgs(opts), "run", "--rm", "--no-deps", ...envFlags, service, ...command];
    const result = await capture("docker", args, { env: opts.env });
    return { ok: result.exitCode === 0, output: [result.stdout, result.stderr].filter(Boolean).join("\n") };
}

/** `docker compose exec -T <service> <command>` — captured. */
export async function composeExec(
    opts: ComposeOptions,
    service: string,
    command: string[],
): Promise<{ ok: boolean; output: string }> {
    const args = [...baseArgs(opts), "exec", "-T", service, ...command];
    const result = await capture("docker", args, { env: opts.env });
    return { ok: result.exitCode === 0, output: [result.stdout, result.stderr].filter(Boolean).join("\n") };
}

/** `docker compose logs --tail <n> [service]` — captured (one-shot; streaming lives in log-stream). */
export async function composeLogs(opts: ComposeOptions, service?: string, tail = 200): Promise<string> {
    const args = [...baseArgs(opts), "logs", "--no-color", "--tail", String(tail)];
    if (service) args.push(service);
    const result = await capture("docker", args, { env: opts.env });
    return [result.stdout, result.stderr].filter(Boolean).join("\n");
}

export interface ComposePsRow {
    Name: string;
    Service: string;
    State: string;
    Status: string;
    Health?: string;
    Publishers?: Array<{ URL: string; TargetPort: number; PublishedPort: number; Protocol: string }>;
}

/** `docker compose ps --format json` → parsed rows. Returns `[]` when the project isn't up. */
export async function composePs(opts: ComposeOptions): Promise<ComposePsRow[]> {
    const result = await capture("docker", [...baseArgs(opts), "ps", "--format", "json"], { env: opts.env });
    if (result.exitCode !== 0) return [];
    return parseComposeJsonLines(result.stdout);
}

/** Compose v2 prints one JSON object per line; some versions wrap output in an array. Handle both. */
export function parseComposeJsonLines(out: string): ComposePsRow[] {
    const trimmed = out.trim();
    if (trimmed.length === 0) return [];
    try {
        if (trimmed.startsWith("[")) return JSON.parse(trimmed) as ComposePsRow[];
    } catch {
        return [];
    }
    const rows: ComposePsRow[] = [];
    for (const line of trimmed.split("\n")) {
        if (!line.trim()) continue;
        try {
            rows.push(JSON.parse(line) as ComposePsRow);
        } catch {
            /* Skip a malformed line rather than crash a reader. */
        }
    }
    return rows;
}

/** Whether the docker CLI is available and responding. */
export async function dockerAvailable(): Promise<boolean> {
    const result = await capture("docker", ["version", "--format", "{{.Client.Version}}"]);
    return result.exitCode === 0;
}
