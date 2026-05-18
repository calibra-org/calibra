/**
 * Banker's rounding ("round half to even"). The ADR's money math (tax extraction, discount
 * apportionment, shipping splits) requires this over `Math.round` because plain round-half-up
 * accumulates an upward bias across many lines — a 1-Rial drift on every row turns into noticeable
 * over-collection on a long invoice.
 *
 * @example
 *  bankersRound(0.5)  // → 0
 *  bankersRound(1.5)  // → 2
 *  bankersRound(2.5)  // → 2
 *  bankersRound(-0.5) // → 0
 *  bankersRound(-1.5) // → -2
 */
export function bankersRound(value: number): number {
    if (!Number.isFinite(value)) return value;
    const sign = value < 0 ? -1 : 1;
    const abs = Math.abs(value);
    const floor = Math.floor(abs);
    const diff = abs - floor;
    let magnitude: number;
    if (diff < 0.5) {
        magnitude = floor;
    } else if (diff > 0.5) {
        magnitude = floor + 1;
    } else {
        magnitude = floor % 2 === 0 ? floor : floor + 1;
    }
    return sign * magnitude;
}
