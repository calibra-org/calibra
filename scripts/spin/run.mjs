// @ts-check

import { spawn } from "node:child_process";

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [opts]
 */
export function run(cmd, args, opts = {}) {
    return new Promise((res, rej) => {
        const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, stdio: "inherit" });
        child.once("error", rej);
        child.once("exit", (code) => {
            if (code === 0) res(undefined);
            else rej(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
        });
    });
}
