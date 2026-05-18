import { test } from "@japa/runner";

import phoneService, { PhoneNormalizationError } from "#services/phone_service";

test.group("phoneService.normalize", () => {
    test("normalizes a leading-zero Iran mobile to E.164", ({ assert }) => {
        assert.equal(phoneService.normalize("09121234567", "IR"), "+989121234567");
        assert.equal(phoneService.normalize("0912 123 4567", "IR"), "+989121234567");
        assert.equal(phoneService.normalize("0912-123-4567", "IR"), "+989121234567");
    });

    test("preserves an already-E.164 Iran number", ({ assert }) => {
        assert.equal(phoneService.normalize("+989121234567", "IR"), "+989121234567");
    });

    test("preserves an E.164 number from a different country", ({ assert }) => {
        assert.equal(phoneService.normalize("+14155551212", "IR"), "+14155551212");
        assert.equal(phoneService.normalize("+442071838750", "US"), "+442071838750");
    });

    test("throws when input cannot be normalized", ({ assert }) => {
        assert.throws(() => phoneService.normalize("", "IR"), PhoneNormalizationError);
        assert.throws(() => phoneService.normalize("abcdef", "IR"), PhoneNormalizationError);
        assert.throws(() => phoneService.normalize("0912", "IR"), PhoneNormalizationError);
        assert.throws(() => phoneService.normalize("09121234567", "ZZ"), PhoneNormalizationError);
    });
});
