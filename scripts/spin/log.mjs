// @ts-check

/**
 * @param {string} msg
 */
export function log(msg) {
    process.stdout.write(`${msg}\n`);
}

/**
 * @param {string} stage
 * @param {string} detail
 */
export function step(stage, detail) {
    log(`  ${dim("›")} ${stage.padEnd(12)} ${detail}`);
}

/** @param {string} s */
export function bold(s) {
    return `\x1b[1m${s}\x1b[22m`;
}
/** @param {string} s */
export function cyan(s) {
    return `\x1b[36m${s}\x1b[39m`;
}
/** @param {string} s */
export function green(s) {
    return `\x1b[32m${s}\x1b[39m`;
}
/** @param {string} s */
export function yellow(s) {
    return `\x1b[33m${s}\x1b[39m`;
}
/** @param {string} s */
export function red(s) {
    return `\x1b[31m${s}\x1b[39m`;
}
/** @param {string} s */
export function dim(s) {
    return `\x1b[2m${s}\x1b[22m`;
}
