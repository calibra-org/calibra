import { test } from "@japa/runner";

import Customer from "#models/customer";
import Region from "#models/region";
import User from "#models/user";
import { truncatePhase03Tables } from "#tests/helpers/db";

async function createCustomer(email: string) {
    const user = await User.create({
        email,
        passwordHash: "Passw0rd1!",
        role: "customer",
        locale: "fa",
    });
    const customer = await Customer.create({
        userId: user.id,
        firstName: "F",
        lastName: "L",
        phone: "+989121234567",
        countryDefault: "IR",
    });
    return { user, customer };
}

async function seedTehranRegion(): Promise<Region> {
    return Region.firstOrCreate(
        { countryCode: "IR", code: "IR-24" },
        { countryCode: "IR", code: "IR-24", ordering: 24, attributes: {} },
    );
}

test.group("POST /api/v1/account/addresses", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
    });

    test("creates an Iran address with region_id", async ({ client, assert }) => {
        const { user } = await createCustomer("ir-addr@calibra.dev");
        const region = await seedTehranRegion();

        const response = await client
            .post("/api/v1/account/addresses")
            .withGuard("api")
            .loginAs(user)
            .json({
                kind: "billing",
                first_name: "علی",
                last_name: "احمدی",
                address_line_1: "خیابان آزادی",
                city: "تهران",
                region_id: Number(region.id),
                postcode: "1234567890",
                country: "IR",
                phone: "09121234567",
                is_default: true,
            });

        response.assertStatus(201);
        const body = response.body();
        assert.equal(body.data.country, "IR");
        assert.equal(body.data.postcode, "1234567890");
        assert.equal(body.data.phone, "+989121234567");
        assert.equal(body.data.region_id, Number(region.id));
        assert.property(body.meta.field_metadata, "postcode");
        assert.equal(body.meta.field_metadata.postcode.label_key, "address.fields.postcode.label.IR");
    });

    test("creates a US address with region_text and no region_id", async ({ client, assert }) => {
        const { user } = await createCustomer("us-addr@calibra.dev");

        const response = await client.post("/api/v1/account/addresses").withGuard("api").loginAs(user).json({
            kind: "billing",
            first_name: "John",
            last_name: "Doe",
            address_line_1: "1 Market Street",
            city: "San Francisco",
            region_text: "California",
            postcode: "94105",
            country: "US",
            phone: "+14155551212",
        });

        response.assertStatus(201);
        const body = response.body();
        assert.equal(body.data.country, "US");
        assert.equal(body.data.region_text, "California");
        assert.isNull(body.data.region_id);
        assert.equal(body.meta.field_metadata.postcode.label_key, "address.fields.postcode.label.default");
    });

    test("rejects an Iran address with no region_id with 422", async ({ client }) => {
        const { user } = await createCustomer("missing-region@calibra.dev");
        const response = await client.post("/api/v1/account/addresses").withGuard("api").loginAs(user).json({
            kind: "billing",
            first_name: "X",
            last_name: "Y",
            address_line_1: "...",
            city: "تهران",
            postcode: "1234567890",
            country: "IR",
            phone: "09121234567",
        });
        response.assertStatus(422);
    });

    test("rejects an Iran address with an invalid iran_extension national_id with 422", async ({ client }) => {
        const { user } = await createCustomer("bad-nid@calibra.dev");
        const region = await seedTehranRegion();
        const response = await client
            .post("/api/v1/account/addresses")
            .withGuard("api")
            .loginAs(user)
            .json({
                kind: "billing",
                first_name: "X",
                last_name: "Y",
                address_line_1: "خیابان",
                city: "تهران",
                region_id: Number(region.id),
                postcode: "1234567890",
                country: "IR",
                phone: "09121234567",
                iran_extension: { national_id: "1234567890" },
            });
        response.assertStatus(422);
    });

    test("succeeds for Iran without iran_extension (extension is optional)", async ({ client }) => {
        const { user } = await createCustomer("no-ext@calibra.dev");
        const region = await seedTehranRegion();
        const response = await client
            .post("/api/v1/account/addresses")
            .withGuard("api")
            .loginAs(user)
            .json({
                kind: "billing",
                first_name: "X",
                last_name: "Y",
                address_line_1: "خیابان",
                city: "تهران",
                region_id: Number(region.id),
                postcode: "1234567890",
                country: "IR",
                phone: "09121234567",
            });
        response.assertStatus(201);
    });

    test("setting is_default=true unsets sibling defaults of the same kind", async ({ client, assert }) => {
        const { user } = await createCustomer("default@calibra.dev");
        const region = await seedTehranRegion();

        const baseBody = {
            kind: "billing" as const,
            first_name: "A",
            last_name: "B",
            address_line_1: "خیابان",
            city: "تهران",
            region_id: Number(region.id),
            postcode: "1234567890",
            country: "IR",
            phone: "09121234567",
        };

        const first = await client
            .post("/api/v1/account/addresses")
            .withGuard("api")
            .loginAs(user)
            .json({ ...baseBody, is_default: true });
        first.assertStatus(201);
        const firstId = first.body().data.id;

        const second = await client
            .post("/api/v1/account/addresses")
            .withGuard("api")
            .loginAs(user)
            .json({ ...baseBody, is_default: true });
        second.assertStatus(201);

        const list = await client.get("/api/v1/account/addresses").withGuard("api").loginAs(user);
        const data = list.body().data as Array<{ id: number; is_default: boolean }>;
        const oldDefault = data.find((a) => a.id === firstId);
        assert.isFalse(oldDefault?.is_default);
        const newDefault = data.find((a) => a.is_default);
        assert.exists(newDefault);
    });

    test("cannot delete the only default of a kind", async ({ client }) => {
        const { user } = await createCustomer("only-default@calibra.dev");
        const region = await seedTehranRegion();

        const created = await client
            .post("/api/v1/account/addresses")
            .withGuard("api")
            .loginAs(user)
            .json({
                kind: "billing",
                first_name: "A",
                last_name: "B",
                address_line_1: "خیابان",
                city: "تهران",
                region_id: Number(region.id),
                postcode: "1234567890",
                country: "IR",
                phone: "09121234567",
                is_default: true,
            });
        const id = created.body().data.id;

        const response = await client.delete(`/api/v1/account/addresses/${id}`).withGuard("api").loginAs(user);
        response.assertStatus(422);
    });

    test("cross-tenant access (another customer's address) returns 404", async ({ client }) => {
        const { user: alice } = await createCustomer("alice@calibra.dev");
        const { user: bob } = await createCustomer("bob@calibra.dev");
        const region = await seedTehranRegion();

        const created = await client
            .post("/api/v1/account/addresses")
            .withGuard("api")
            .loginAs(alice)
            .json({
                kind: "billing",
                first_name: "A",
                last_name: "B",
                address_line_1: "خیابان",
                city: "تهران",
                region_id: Number(region.id),
                postcode: "1234567890",
                country: "IR",
                phone: "09121234567",
            });
        const id = created.body().data.id;

        const access = await client.get(`/api/v1/account/addresses/${id}`).withGuard("api").loginAs(bob);
        access.assertStatus(404);
    });
});
