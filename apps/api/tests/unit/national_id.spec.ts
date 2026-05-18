import { test } from "@japa/runner";

import nationalIdService from "#services/national_id_service";

test.group("nationalIdService.validate", () => {
    test("accepts a known-valid کد ملی", ({ assert }) => {
        assert.isTrue(nationalIdService.validate("1234567891"));
        assert.isTrue(nationalIdService.validate("0123456789"));
    });

    test("rejects strings of the wrong length", ({ assert }) => {
        assert.isFalse(nationalIdService.validate("123"));
        assert.isFalse(nationalIdService.validate("12345678910"));
    });

    test("rejects all-same-digit strings", ({ assert }) => {
        assert.isFalse(nationalIdService.validate("0000000000"));
        assert.isFalse(nationalIdService.validate("1111111111"));
        assert.isFalse(nationalIdService.validate("9999999999"));
    });

    test("rejects strings with a bad checksum", ({ assert }) => {
        assert.isFalse(nationalIdService.validate("1234567890"));
        assert.isFalse(nationalIdService.validate("0123456788"));
    });

    test("rejects non-digit input", ({ assert }) => {
        assert.isFalse(nationalIdService.validate("1234567a91"));
        assert.isFalse(nationalIdService.validate(""));
        assert.isFalse(nationalIdService.validate(null as unknown as string));
        assert.isFalse(nationalIdService.validate(undefined as unknown as string));
    });
});
