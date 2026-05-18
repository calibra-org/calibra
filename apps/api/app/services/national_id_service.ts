/**
 * `کد ملی` validator — Iran's 10-digit personal national ID. Used only when a customer or order
 * address opts into the Iran-specific extension fields (Pattern 3); never required globally, so
 * foreign customers never hit this code path.
 *
 * Algorithm (per the official spec):
 *   - 10 digits, with the last digit being the check digit;
 *   - all-same-digit strings (e.g. `1111111111`) are deliberately rejected — they pass the
 *     modular math by coincidence but are not valid IDs;
 *   - weighted sum of the first 9 digits with weights 10..2, take `% 11`. The check digit equals
 *     that remainder when it's < 2, otherwise `11 - remainder`.
 */
export class NationalIdService {
    validate(nid: string | null | undefined): boolean {
        if (typeof nid !== "string") return false;
        if (!/^\d{10}$/.test(nid)) return false;
        if (/^(\d)\1{9}$/.test(nid)) return false;

        const digits = nid.split("").map((char) => Number.parseInt(char, 10));
        const check = digits[9]!;
        const sum = digits.slice(0, 9).reduce((acc, d, i) => acc + d * (10 - i), 0);
        const remainder = sum % 11;
        return remainder < 2 ? check === remainder : check === 11 - remainder;
    }
}

const nationalIdService = new NationalIdService();
export default nationalIdService;
