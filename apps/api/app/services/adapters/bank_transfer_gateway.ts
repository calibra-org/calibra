import type { InitArgs, InitResult, PaymentAdapter, PaymentAdapterCapabilities } from "#services/adapters/base_redirect_gateway";

interface BankTransferSettings {
    iban?: string;
    account_name?: string;
    bank_name?: string;
    notes?: string;
}

/**
 * Bank-transfer (offline). Special non-redirect adapter — `init` returns `redirect_url=null`,
 * `payment_service.init` flips the order to `on_hold`, and a customer-visible note containing the
 * IBAN + account name from settings is recorded on the attempt's payload (the order-notes table
 * lands in phase 07; until then the note rides on `gateway_payload.customer_note`).
 */
export class BankTransferGateway implements PaymentAdapter {
    readonly code = "bank_transfer";
    readonly capabilities: PaymentAdapterCapabilities = { redirect: false, refunds: false, partial_refunds: false };

    async init(args: InitArgs): Promise<InitResult> {
        const settings = args.settings as BankTransferSettings;
        const iban = settings.iban?.trim() ?? "";
        const accountName = settings.account_name?.trim() ?? "";
        const bankName = settings.bank_name?.trim() ?? "";
        const lines: string[] = [];
        if (iban) lines.push(`IBAN: ${iban}`);
        if (accountName) lines.push(`Account name: ${accountName}`);
        if (bankName) lines.push(`Bank: ${bankName}`);
        if (settings.notes) lines.push(settings.notes);
        const customerNote = lines.join("\n");
        return {
            redirect_url: null,
            payload: {
                method: "bank_transfer",
                customer_note: customerNote,
                iban,
                account_name: accountName,
                bank_name: bankName,
            },
        };
    }
}

export const bankTransferGateway = new BankTransferGateway();
