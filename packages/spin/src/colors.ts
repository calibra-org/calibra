/**
 * Zero-dependency ANSI color helpers. We hand-roll this instead of pulling in `kleur`
 * to keep the spin package's dependency surface to the two approved additions
 * (`commander`, `ink`). Color is disabled when stderr is not a TTY, when `NO_COLOR` is
 * set, or when `TERM=dumb`, and force-enabled when `FORCE_COLOR` is truthy — matching
 * the conventions every other CLI on the machine already follows.
 *
 * @see {@link https://no-color.org}
 */

const noColorRequested = process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "";
const forceColor = process.env.FORCE_COLOR === "1" || process.env.FORCE_COLOR === "true";
const dumbTerminal = process.env.TERM === "dumb";

/** Whether ANSI escapes should be emitted at all for this process. */
export const colorEnabled = forceColor || (!noColorRequested && !dumbTerminal && Boolean(process.stderr.isTTY));

function style(open: number, close: number): (value: string | number) => string {
    const prefix = `[${open}m`;
    const suffix = `[${close}m`;
    return (value) => (colorEnabled ? `${prefix}${value}${suffix}` : String(value));
}

/** Named ANSI styles. Each is a no-op passthrough when color is disabled. */
export const c = {
    bold: style(1, 22),
    dim: style(2, 22),
    italic: style(3, 23),
    underline: style(4, 24),
    red: style(31, 39),
    green: style(32, 39),
    yellow: style(33, 39),
    blue: style(34, 39),
    magenta: style(35, 39),
    cyan: style(36, 39),
    gray: style(90, 39),
};
