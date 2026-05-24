/**
 * Type shim for `jalaali-js` — the upstream package is plain JS and `@types/jalaali-js` doesn't
 * exist on npm. Declares the small surface used by `app/services/product_import/cell_normalizer`.
 *
 * @see {@link https://github.com/jalaali/jalaali-js}
 */
declare module "jalaali-js" {
    export interface JalaaliDate {
        jy: number;
        jm: number;
        jd: number;
    }
    export interface GregorianDate {
        gy: number;
        gm: number;
        gd: number;
    }
    interface Jalaali {
        toJalaali(gy: number, gm: number, gd: number): JalaaliDate;
        toJalaali(date: Date): JalaaliDate;
        toGregorian(jy: number, jm: number, jd: number): GregorianDate;
        isValidJalaaliDate(jy: number, jm: number, jd: number): boolean;
        isLeapJalaaliYear(jy: number): boolean;
        jalaaliMonthLength(jy: number, jm: number): number;
    }
    const jalaali: Jalaali;
    export default jalaali;
}
