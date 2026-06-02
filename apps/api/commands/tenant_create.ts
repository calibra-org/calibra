import { args, BaseCommand, flags } from "@adonisjs/core/ace";
import type { CommandOptions } from "@adonisjs/core/types/ace";

/**
 * Provision a new tenant from the CLI (the seeder + Phase 5 control-plane API use the same
 * {@link TenantProvisioningService}). Creates the tenant, its subdomain, per-tenant defaults, and the
 * owner shop-admin user.
 *
 *   node ace tenant:create acme --name="Acme" --owner-email=owner@acme.test --owner-password=Secret123!
 */
export default class TenantCreate extends BaseCommand {
    static commandName = "tenant:create";
    static description = "Provision a new tenant (registry row, subdomain, defaults, owner user).";

    static options: CommandOptions = {
        startApp: true,
    };

    @args.string({ description: "Tenant slug (lowercase alphanumerics + single dashes)." })
    declare slug: string;

    @flags.string({ description: "Display name. Defaults to the slug." })
    declare name?: string;

    @flags.string({ description: "Plan key. Default: starter." })
    declare plan?: string;

    @flags.string({ description: "Currency code from the catalog. Default: IRR." })
    declare currency?: string;

    @flags.string({ description: "Owner email (email or phone required)." })
    declare ownerEmail?: string;

    @flags.string({ description: "Owner phone in E.164 (email or phone required)." })
    declare ownerPhone?: string;

    @flags.string({ description: "Owner password. Default: ChangeMe123!" })
    declare ownerPassword?: string;

    async run() {
        const { TenantProvisioningService } = await import("#services/tenant_provisioning_service");
        const service = new TenantProvisioningService();
        const result = await service.provision({
            slug: this.slug,
            name: this.name ?? this.slug,
            planKey: this.plan ?? "starter",
            currencyCode: this.currency ?? "IRR",
            ownerEmail: this.ownerEmail ?? null,
            ownerPhone: this.ownerPhone ?? null,
            ownerPassword: this.ownerPassword ?? null,
        });
        this.logger.success(`Tenant #${result.id} (${result.slug}) provisioned. Owner user #${result.ownerUserId}.`);
    }
}
