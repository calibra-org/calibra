/**
 * Money amount in MAJOR units (Toman). 1 Toman = 10 Rial.
 * Inputs are displayed in Toman; the wire format (DB, API) is always Rial minor units.
 */
export type MoneyMajor = number;

/** Money amount in MINOR units (Rial). */
export type MoneyMinor = number;

/**
 * Toman → Rial. Rounds to the nearest integer so off-by-one cents from float math never
 * leak into a BIGINT column. Pass through `null`.
 */
export function tomanToRial(major: MoneyMajor | null): MoneyMinor | null;
export function tomanToRial(major: MoneyMajor): MoneyMinor;
export function tomanToRial(major: MoneyMajor | null): MoneyMinor | null {
    if (major === null || major === undefined) return null;
    return Math.round(major * 10);
}

/** Rial → Toman. Returns `null` for `null` input. Float result is exact for any integer Toman. */
export function rialToToman(minor: MoneyMinor | null): MoneyMajor | null {
    if (minor === null || minor === undefined) return null;
    return minor / 10;
}
