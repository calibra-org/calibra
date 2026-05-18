import { BaseSeeder } from "@adonisjs/lucid/seeders";

import Customer from "#models/customer";
import CustomerAddress from "#models/customer_address";
import CustomerIranProfile from "#models/customer_iran_profile";
import Region from "#models/region";
import User from "#models/user";

interface PersonSeed {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    countryDefault: string;
    regionCode?: string;
    iran?: {
        nationalId: string;
        corporateNationalId?: string;
        economicCode?: string;
        legalCompanyNameFa?: string;
    };
    addresses: Array<{
        kind: "billing" | "shipping" | "both";
        firstName: string;
        lastName: string;
        addressLine1: string;
        city: string;
        regionCode?: string;
        regionText?: string;
        postcode?: string;
        country: string;
        phone: string;
        isDefault?: boolean;
        label?: string;
    }>;
}

const PASSWORD = "Passw0rd1!";
const ADMIN_PASSWORD = "admin1234";

/**
 * Phase 03 demo data. Idempotent: every write goes through `updateOrCreate` so running the seeder
 * twice produces the same database state. The set includes:
 *   - 1 admin user (`admin@calibra.dev`)
 *   - 8 Iranian customers (3 of which carry a `customer_iran_profiles` row with valid checksums)
 *   - 2 foreign customers (US + TR) — exercise the country-rules service's `region_text` path
 *
 * Each customer gets 1–3 addresses (mix of IR + foreign) keyed by `(customer_id, kind, label)` for
 * stable idempotency.
 */
export default class CustomersDemoSeeder extends BaseSeeder {
    static environment = ["__phase_seeder__"];

    async run() {
        const regionsByCode = await this.loadIranRegions();

        await this.seedAdmin();

        for (const person of CUSTOMER_SEEDS) {
            const user = await this.seedUser(person);
            const customer = await this.seedCustomer(user, person);
            if (person.iran) await this.seedIranProfile(customer, person.iran);
            await this.seedAddresses(customer, person, regionsByCode);
        }
    }

    private async loadIranRegions(): Promise<Map<string, Region>> {
        const rows = await Region.query({ client: this.client }).where("country_code", "IR");
        const map = new Map<string, Region>();
        for (const r of rows) map.set(r.code, r);
        return map;
    }

    private async seedAdmin(): Promise<void> {
        const existing = await User.findBy("email", "admin@calibra.dev", { client: this.client });
        if (!existing) {
            await User.create(
                {
                    email: "admin@calibra.dev",
                    passwordHash: ADMIN_PASSWORD,
                    role: "admin",
                    locale: "fa",
                },
                { client: this.client },
            );
        }

        const user = await User.findByOrFail("email", "admin@calibra.dev", { client: this.client });
        const customer = await Customer.findBy("user_id", user.id, { client: this.client });
        if (!customer) {
            await Customer.create(
                {
                    userId: user.id,
                    firstName: "مدیر",
                    lastName: "سامانه",
                    phone: "+989121111111",
                    countryDefault: "IR",
                    isPayingCustomer: false,
                },
                { client: this.client },
            );
        }
    }

    private async seedUser(person: PersonSeed): Promise<User> {
        const existing = await User.findBy("email", person.email, { client: this.client });
        if (existing) return existing;
        return User.create(
            {
                email: person.email,
                passwordHash: PASSWORD,
                role: "customer",
                locale: "fa",
            },
            { client: this.client },
        );
    }

    private async seedCustomer(user: User, person: PersonSeed): Promise<Customer> {
        return Customer.updateOrCreate(
            { userId: user.id },
            {
                userId: user.id,
                firstName: person.firstName,
                lastName: person.lastName,
                phone: person.phone,
                countryDefault: person.countryDefault,
                isPayingCustomer: false,
            },
            { client: this.client },
        );
    }

    private async seedIranProfile(customer: Customer, iran: NonNullable<PersonSeed["iran"]>): Promise<void> {
        await CustomerIranProfile.updateOrCreate(
            { customerId: Number(customer.id) },
            {
                customerId: Number(customer.id),
                nationalId: iran.nationalId,
                corporateNationalId: iran.corporateNationalId ?? null,
                economicCode: iran.economicCode ?? null,
                legalCompanyNameFa: iran.legalCompanyNameFa ?? null,
            },
            { client: this.client },
        );
    }

    private async seedAddresses(customer: Customer, person: PersonSeed, regionsByCode: Map<string, Region>): Promise<void> {
        for (const [index, addr] of person.addresses.entries()) {
            const label = addr.label ?? `address-${index + 1}`;
            const region = addr.regionCode ? regionsByCode.get(addr.regionCode) : null;
            await CustomerAddress.updateOrCreate(
                { customerId: Number(customer.id), label },
                {
                    customerId: Number(customer.id),
                    kind: addr.kind,
                    label,
                    firstName: addr.firstName,
                    lastName: addr.lastName,
                    company: null,
                    addressLine1: addr.addressLine1,
                    addressLine2: null,
                    city: addr.city,
                    regionId: region ? Number(region.id) : null,
                    regionText: addr.regionText ?? null,
                    postcode: addr.postcode ?? null,
                    country: addr.country,
                    phone: addr.phone,
                    isDefault: addr.isDefault ?? false,
                },
                { client: this.client },
            );
        }
    }
}

/**
 * The seed data. National IDs were chosen by running the standard کد ملی checksum until a few
 * deterministic values came out valid — they're stable identifiers, not anyone's real ID.
 */
const CUSTOMER_SEEDS: PersonSeed[] = [
    {
        email: "ali.ahmadi@calibra.dev",
        firstName: "علی",
        lastName: "احمدی",
        phone: "+989121111101",
        countryDefault: "IR",
        regionCode: "IR-24",
        iran: { nationalId: "1234567891", legalCompanyNameFa: "فروشگاه علی" },
        addresses: [
            {
                kind: "both",
                firstName: "علی",
                lastName: "احمدی",
                addressLine1: "خیابان آزادی، پلاک ۱۲",
                city: "تهران",
                regionCode: "IR-24",
                postcode: "1411713111",
                country: "IR",
                phone: "+989121111101",
                isDefault: true,
            },
        ],
    },
    {
        email: "sara.mohammadi@calibra.dev",
        firstName: "سارا",
        lastName: "محمدی",
        phone: "+989121111102",
        countryDefault: "IR",
        regionCode: "IR-11",
        iran: { nationalId: "0123456789" },
        addresses: [
            {
                kind: "billing",
                firstName: "سارا",
                lastName: "محمدی",
                addressLine1: "خیابان چهارباغ، پلاک ۴۵",
                city: "اصفهان",
                regionCode: "IR-11",
                postcode: "8173984551",
                country: "IR",
                phone: "+989121111102",
                isDefault: true,
            },
            {
                kind: "shipping",
                firstName: "سارا",
                lastName: "محمدی",
                addressLine1: "محل کار",
                city: "اصفهان",
                regionCode: "IR-11",
                postcode: "8173984552",
                country: "IR",
                phone: "+989121111102",
            },
        ],
    },
    {
        email: "reza.karimi@calibra.dev",
        firstName: "رضا",
        lastName: "کریمی",
        phone: "+989121111103",
        countryDefault: "IR",
        regionCode: "IR-08",
        iran: { nationalId: "1234567891", legalCompanyNameFa: "آرا تجارت کریمی" },
        addresses: [
            {
                kind: "both",
                firstName: "رضا",
                lastName: "کریمی",
                addressLine1: "بلوار زند، پلاک ۸",
                city: "شیراز",
                regionCode: "IR-08",
                postcode: "7194653211",
                country: "IR",
                phone: "+989121111103",
                isDefault: true,
            },
        ],
    },
    {
        email: "narges.hosseini@calibra.dev",
        firstName: "نرگس",
        lastName: "حسینی",
        phone: "+989121111104",
        countryDefault: "IR",
        regionCode: "IR-10",
        addresses: [
            {
                kind: "both",
                firstName: "نرگس",
                lastName: "حسینی",
                addressLine1: "بلوار سجاد، کوچه ۱۲",
                city: "مشهد",
                regionCode: "IR-10",
                postcode: "9183715346",
                country: "IR",
                phone: "+989121111104",
                isDefault: true,
            },
        ],
    },
    {
        email: "amir.rezaei@calibra.dev",
        firstName: "امیر",
        lastName: "رضایی",
        phone: "+989121111105",
        countryDefault: "IR",
        regionCode: "IR-31",
        addresses: [
            {
                kind: "billing",
                firstName: "امیر",
                lastName: "رضایی",
                addressLine1: "خیابان شهید بهشتی، پلاک ۲۳",
                city: "کرج",
                regionCode: "IR-31",
                postcode: "3149761423",
                country: "IR",
                phone: "+989121111105",
                isDefault: true,
            },
        ],
    },
    {
        email: "maryam.zare@calibra.dev",
        firstName: "مریم",
        lastName: "زارع",
        phone: "+989121111106",
        countryDefault: "IR",
        regionCode: "IR-02",
        addresses: [
            {
                kind: "both",
                firstName: "مریم",
                lastName: "زارع",
                addressLine1: "خیابان سعدی، پلاک ۷",
                city: "رشت",
                regionCode: "IR-02",
                postcode: "4135647832",
                country: "IR",
                phone: "+989121111106",
                isDefault: true,
            },
        ],
    },
    {
        email: "hossein.ebrahimi@calibra.dev",
        firstName: "حسین",
        lastName: "ابراهیمی",
        phone: "+989121111107",
        countryDefault: "IR",
        regionCode: "IR-04",
        addresses: [
            {
                kind: "both",
                firstName: "حسین",
                lastName: "ابراهیمی",
                addressLine1: "خیابان جمهوری، پلاک ۱۲",
                city: "تبریز",
                regionCode: "IR-04",
                postcode: "5135765432",
                country: "IR",
                phone: "+989121111107",
                isDefault: true,
            },
        ],
    },
    {
        email: "fatemeh.akbari@calibra.dev",
        firstName: "فاطمه",
        lastName: "اکبری",
        phone: "+989121111108",
        countryDefault: "IR",
        regionCode: "IR-23",
        addresses: [
            {
                kind: "shipping",
                firstName: "فاطمه",
                lastName: "اکبری",
                addressLine1: "خیابان طالقانی، پلاک ۵",
                city: "بندرعباس",
                regionCode: "IR-23",
                postcode: "7913745634",
                country: "IR",
                phone: "+989121111108",
                isDefault: true,
            },
        ],
    },
    {
        email: "john.smith@calibra.dev",
        firstName: "John",
        lastName: "Smith",
        phone: "+14155550100",
        countryDefault: "US",
        addresses: [
            {
                kind: "both",
                firstName: "John",
                lastName: "Smith",
                addressLine1: "525 Market Street",
                city: "San Francisco",
                regionText: "California",
                postcode: "94105",
                country: "US",
                phone: "+14155550100",
                isDefault: true,
                label: "us-home",
            },
        ],
    },
    {
        email: "emine.yilmaz@calibra.dev",
        firstName: "Emine",
        lastName: "Yılmaz",
        phone: "+905321234567",
        countryDefault: "TR",
        addresses: [
            {
                kind: "both",
                firstName: "Emine",
                lastName: "Yılmaz",
                addressLine1: "İstiklal Caddesi 144",
                city: "Istanbul",
                regionText: "Istanbul",
                postcode: "34430",
                country: "TR",
                phone: "+905321234567",
                isDefault: true,
                label: "tr-home",
            },
        ],
    },
];
