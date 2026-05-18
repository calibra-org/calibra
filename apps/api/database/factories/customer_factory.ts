import factory from "@adonisjs/lucid/factories";

import Customer from "#models/customer";

let counter = 0;

export const CustomerFactory = factory
    .define(Customer, async () => {
        counter += 1;
        return {
            firstName: `First${counter}`,
            lastName: `Last${counter}`,
            phone: "+989121234567",
            countryDefault: "IR" as const,
            isPayingCustomer: false,
        };
    })
    .state("foreign", (customer) => {
        customer.countryDefault = "US";
        customer.phone = "+14155550100";
    })
    .build();
