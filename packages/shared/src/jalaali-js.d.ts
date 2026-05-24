/**
 * Local type shim for `jalaali-js`. The upstream package is plain JS and there is no
 * `@types/jalaali-js` on npm, so we declare the small surface we use here.
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
