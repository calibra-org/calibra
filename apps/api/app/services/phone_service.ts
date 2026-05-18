/**
 * Lightweight phone normalizer — produces an E.164 string for storage. Deliberately not a full
 * libphonenumber port; it handles the two formats Iranian users actually paste in (with or without
 * the leading 0) plus any string that already arrives in international form. Anything else throws,
 * which the validator translates into a 422.
 */

export class PhoneNormalizationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PhoneNormalizationError";
    }
}

const COUNTRY_DIAL_CODES: Record<string, string> = {
    IR: "98",
    US: "1",
    GB: "44",
    DE: "49",
    FR: "33",
    AE: "971",
    TR: "90",
    CA: "1",
    AU: "61",
    NL: "31",
};

export class PhoneService {
    /**
     * Returns the input in E.164 form (`+<country><subscriber>`), preserving the country prefix
     * when one was supplied. The `defaultCountry` only fires when the input has no `+` and starts
     * with the local trunk-zero — Iranian users typing `09121234567` get prepended to `+98…`.
     */
    normalize(input: string, defaultCountry: string): string {
        if (typeof input !== "string") {
            throw new PhoneNormalizationError("Phone must be a string");
        }

        const trimmed = input.trim();
        if (trimmed === "") {
            throw new PhoneNormalizationError("Phone cannot be empty");
        }

        if (trimmed.startsWith("+")) {
            const digitsOnly = trimmed.slice(1).replace(/\D+/g, "");
            if (digitsOnly.length < 8 || digitsOnly.length > 15) {
                throw new PhoneNormalizationError(`Invalid E.164 length: ${input}`);
            }
            return `+${digitsOnly}`;
        }

        const digitsOnly = trimmed.replace(/\D+/g, "");
        if (digitsOnly === "") {
            throw new PhoneNormalizationError(`Phone has no digits: ${input}`);
        }

        const dialCode = COUNTRY_DIAL_CODES[defaultCountry.toUpperCase()];
        if (!dialCode) {
            throw new PhoneNormalizationError(`No dial code for country ${defaultCountry}`);
        }

        /**
         * Strip the local trunk zero for countries that use one (Iran, UK, etc.). The dial code is
         * what makes the number internationally routable.
         */
        const local = digitsOnly.startsWith("0") ? digitsOnly.slice(1) : digitsOnly;
        if (local.length < 6 || local.length > 14) {
            throw new PhoneNormalizationError(`Invalid local length: ${input}`);
        }

        const candidate = `+${dialCode}${local}`;
        const totalDigits = candidate.length - 1;
        if (totalDigits < 8 || totalDigits > 15) {
            throw new PhoneNormalizationError(`Normalized number exceeds E.164 bounds: ${input}`);
        }
        return candidate;
    }
}

const phoneService = new PhoneService();
export default phoneService;
