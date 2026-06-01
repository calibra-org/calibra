import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * The tenant-isolation sweep. For every per-tenant table this migration:
 *  1. adds `tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`,
 *  2. indexes `tenant_id` (so the RLS predicate is index-backed),
 *  3. `ENABLE` + `FORCE ROW LEVEL SECURITY`, and
 *  4. creates the `tenant_isolation` policy keyed off the per-transaction
 *     `app.current_tenant` GUC.
 *
 * `FORCE` subjects even the table owner to the policy — the only ways to bypass are a superuser or a
 * `BYPASSRLS` role (`calibra_admin`, used by migrations/seeders/worker). The runtime role
 * (`calibra_app`, NOBYPASSRLS) is always filtered. `current_setting('app.current_tenant', true)`
 * returns NULL when unset, so the predicate is false and an un-scoped query returns ZERO rows —
 * fail-closed, never another tenant's data.
 *
 * Pre-production: the schema is rebuilt from empty (`migration:fresh` + reseed), so adding NOT NULL
 * columns without a backfill default is safe. `users` already gained `tenant_id` in the auth-refactor
 * migration, so here it only receives RLS. `otp_codes` and `tenant_number_counters` are excluded —
 * they carry `tenant_id` + RLS in their own create migrations. `settings` is special-cased because
 * its primary key is composite (`group_key, key`) and must absorb `tenant_id`.
 *
 * Global / reference / control-plane tables are NOT touched: tenants, plans, tenant_domains,
 * platform_users, platform_access_tokens, tenant_usage_daily, tenant_impersonation_events, regions,
 * region_translations, currencies, queue_jobs, queue_schedules, auth_access_tokens,
 * password_reset_tokens.
 */
export default class extends BaseSchema {
    /**
     * Per-tenant tables that receive `tenant_id` + a `tenant_id` index + RLS via the generic loop.
     * Excludes `users` (RLS-only here), `settings` (special-cased), and the two tables that already
     * self-applied tenant_id+RLS in their create migrations.
     */
    private readonly tenantTables = [
        "customers",
        "customer_addresses",
        "customer_downloads",
        "customer_notes",
        "customer_status_history",
        "customer_tags",
        "customer_tag_pivot",
        "customer_segments",
        "customer_marketing_prefs",
        "customer_marketing_consent_history",
        "customer_merge_history",
        "customer_impersonation_events",
        "customer_iran_profiles",
        "carts",
        "cart_items",
        "cart_applied_coupons",
        "orders",
        "order_addresses",
        "order_line_items",
        "order_line_item_taxes",
        "order_shipping_lines",
        "order_fee_lines",
        "order_coupon_lines",
        "order_tax_lines",
        "order_status_history",
        "order_documents",
        "order_meta",
        "order_notes",
        "order_refunds",
        "order_refund_line_items",
        "order_address_iran_extensions",
        "payment_attempts",
        "payment_links",
        "payment_gateways",
        "products",
        "product_translations",
        "product_variations",
        "product_variation_translations",
        "product_images",
        "product_categories",
        "product_category_translations",
        "product_category_links",
        "product_tags",
        "product_tag_translations",
        "product_tag_links",
        "product_brands",
        "product_brand_translations",
        "product_brand_links",
        "product_attributes",
        "product_attribute_translations",
        "product_attribute_terms",
        "product_attribute_term_translations",
        "product_attribute_links",
        "product_attribute_link_terms",
        "product_variation_attributes",
        "product_custom_attributes",
        "product_cross_sells",
        "product_upsells",
        "product_group_members",
        "product_downloads",
        "product_reviews",
        "product_favorites",
        "product_shipping_classes",
        "product_shipping_class_translations",
        "inventory_items",
        "inventory_movements",
        "tax_classes",
        "tax_rates",
        "shipping_zones",
        "shipping_zone_locations",
        "shipping_methods",
        "shipping_zone_methods",
        "coupons",
        "coupon_translations",
        "coupon_product_constraints",
        "coupon_category_constraints",
        "coupon_brand_constraints",
        "coupon_email_restrictions",
        "coupon_redemptions",
        "media",
        "admin_audit_log",
        "product_imports",
        "product_import_errors",
        "product_import_changes",
        "product_import_mapping_presets",
        "product_exports",
        "product_export_filter_presets",
        "processed_webhook_events",
    ];

    /**
     * Enables FORCE RLS on a table and installs the `tenant_isolation` policy. Shared by the generic
     * loop, the `users` table, and `settings`.
     */
    private enableRls(table: string) {
        this.schema.raw(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
        this.schema.raw(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
        this.schema.raw(
            `CREATE POLICY "tenant_isolation" ON "${table}" ` +
                `USING (tenant_id = current_setting('app.current_tenant', true)::bigint) ` +
                `WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::bigint)`,
        );
    }

    async up() {
        for (const table of this.tenantTables) {
            this.schema.raw(
                `ALTER TABLE "${table}" ADD COLUMN "tenant_id" bigint NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE`,
            );
            this.schema.raw(`CREATE INDEX "${table}_tenant_id_idx" ON "${table}" ("tenant_id")`);
            this.enableRls(table);
        }

        /** `users` already has `tenant_id` (auth-refactor migration) + a tenant_id index. RLS only. */
        this.enableRls("users");

        /** `settings`: fold tenant_id into the composite primary key, then RLS. */
        this.schema.raw(
            `ALTER TABLE "settings" ADD COLUMN "tenant_id" bigint NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE`,
        );
        this.schema.raw(`ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey"`);
        this.schema.raw(`ALTER TABLE "settings" ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("tenant_id", "group_key", "key")`);
        this.enableRls("settings");

        this.rescopeUniques();
    }

    /**
     * Re-scopes every global UNIQUE that guards a tenant-owned value so the same value can recur
     * across shops (two stores can both have SKU `TSHIRT-1`, coupon `WELCOME`, order #1000, …).
     * Constraints (`contype='u'`/PK) are dropped via `DROP CONSTRAINT`; partial/expression uniques
     * are plain indexes dropped via `DROP INDEX`. All are recreated as `tenant_id`-leading unique
     * indexes preserving any original partial predicate. FK-discriminated child tables (cart_items,
     * order detail lines, coupon constraints, translations' composite PKs, …) are already tenant-safe
     * via their parent FK and are intentionally left alone.
     */
    private rescopeUniques() {
        /** Unique CONSTRAINTS → drop constraint, recreate as tenant-scoped unique index. */
        this.schema.raw(`ALTER TABLE "coupons" DROP CONSTRAINT "coupons_code_unique"`);
        this.schema.raw(`CREATE UNIQUE INDEX "coupons_code_unique" ON "coupons" ("tenant_id", "code")`);

        this.schema.raw(`ALTER TABLE "customer_tags" DROP CONSTRAINT "customer_tags_name_unique"`);
        this.schema.raw(`CREATE UNIQUE INDEX "customer_tags_name_unique" ON "customer_tags" ("tenant_id", "name")`);

        this.schema.raw(`ALTER TABLE "customers" DROP CONSTRAINT "customers_user_id_unique"`);
        this.schema.raw(`CREATE UNIQUE INDEX "customers_user_id_unique" ON "customers" ("tenant_id", "user_id")`);

        this.schema.raw(`ALTER TABLE "orders" DROP CONSTRAINT "orders_order_number_unique"`);
        this.schema.raw(`CREATE UNIQUE INDEX "orders_order_number_unique" ON "orders" ("tenant_id", "order_number")`);

        this.schema.raw(`ALTER TABLE "order_refunds" DROP CONSTRAINT "order_refunds_refund_number_unique"`);
        this.schema.raw(
            `CREATE UNIQUE INDEX "order_refunds_refund_number_unique" ON "order_refunds" ("tenant_id", "refund_number")`,
        );

        this.schema.raw(`ALTER TABLE "payment_gateways" DROP CONSTRAINT "payment_gateways_code_unique"`);
        this.schema.raw(`CREATE UNIQUE INDEX "payment_gateways_code_unique" ON "payment_gateways" ("tenant_id", "code")`);

        this.schema.raw(`ALTER TABLE "product_attributes" DROP CONSTRAINT "product_attributes_code_unique"`);
        this.schema.raw(`CREATE UNIQUE INDEX "product_attributes_code_unique" ON "product_attributes" ("tenant_id", "code")`);

        this.schema.raw(`ALTER TABLE "product_shipping_classes" DROP CONSTRAINT "product_shipping_classes_slug_unique"`);
        this.schema.raw(
            `CREATE UNIQUE INDEX "product_shipping_classes_slug_unique" ON "product_shipping_classes" ("tenant_id", "slug")`,
        );

        this.schema.raw(`ALTER TABLE "shipping_methods" DROP CONSTRAINT "shipping_methods_code_unique"`);
        this.schema.raw(`CREATE UNIQUE INDEX "shipping_methods_code_unique" ON "shipping_methods" ("tenant_id", "code")`);

        this.schema.raw(`ALTER TABLE "tax_classes" DROP CONSTRAINT "tax_classes_slug_unique"`);
        this.schema.raw(`CREATE UNIQUE INDEX "tax_classes_slug_unique" ON "tax_classes" ("tenant_id", "slug")`);

        this.schema.raw(
            `ALTER TABLE "processed_webhook_events" DROP CONSTRAINT "processed_webhook_events_provider_event_id_unique"`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX "processed_webhook_events_provider_event_id_unique" ON "processed_webhook_events" ("tenant_id", "provider", "event_id")`,
        );

        this.schema.raw(`ALTER TABLE "product_translations" DROP CONSTRAINT "product_translations_locale_slug_unique"`);
        this.schema.raw(
            `CREATE UNIQUE INDEX "product_translations_locale_slug_unique" ON "product_translations" ("tenant_id", "locale", "slug")`,
        );

        this.schema.raw(
            `ALTER TABLE "product_category_translations" DROP CONSTRAINT "product_category_translations_locale_slug_unique"`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX "product_category_translations_locale_slug_unique" ON "product_category_translations" ("tenant_id", "locale", "slug")`,
        );

        this.schema.raw(`ALTER TABLE "product_tag_translations" DROP CONSTRAINT "product_tag_translations_locale_slug_unique"`);
        this.schema.raw(
            `CREATE UNIQUE INDEX "product_tag_translations_locale_slug_unique" ON "product_tag_translations" ("tenant_id", "locale", "slug")`,
        );

        this.schema.raw(
            `ALTER TABLE "product_brand_translations" DROP CONSTRAINT "product_brand_translations_locale_slug_unique"`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX "product_brand_translations_locale_slug_unique" ON "product_brand_translations" ("tenant_id", "locale", "slug")`,
        );

        /** Partial / expression UNIQUE INDEXES → drop index, recreate tenant-scoped with same predicate. */
        this.schema.raw(`DROP INDEX "products_sku_lower_unique"`);
        this.schema.raw(
            `CREATE UNIQUE INDEX "products_sku_lower_unique" ON "products" ("tenant_id", lower((sku)::text)) WHERE ((sku IS NOT NULL) AND (deleted_at IS NULL))`,
        );

        this.schema.raw(`DROP INDEX "product_variations_sku_lower_unique"`);
        this.schema.raw(
            `CREATE UNIQUE INDEX "product_variations_sku_lower_unique" ON "product_variations" ("tenant_id", lower((sku)::text)) WHERE ((sku IS NOT NULL) AND (deleted_at IS NULL))`,
        );

        this.schema.raw(`DROP INDEX "orders_idempotency_key_unique"`);
        this.schema.raw(
            `CREATE UNIQUE INDEX "orders_idempotency_key_unique" ON "orders" ("tenant_id", "idempotency_key") WHERE (idempotency_key IS NOT NULL)`,
        );

        this.schema.raw(`DROP INDEX "order_documents_type_number_unique"`);
        this.schema.raw(
            `CREATE UNIQUE INDEX "order_documents_type_number_unique" ON "order_documents" ("tenant_id", "type", "number") WHERE (number IS NOT NULL)`,
        );

        this.schema.raw(`DROP INDEX "payment_attempts_gateway_tx_unique"`);
        this.schema.raw(
            `CREATE UNIQUE INDEX "payment_attempts_gateway_tx_unique" ON "payment_attempts" ("tenant_id", "gateway_id", "gateway_transaction_id") WHERE (gateway_transaction_id IS NOT NULL)`,
        );

        this.schema.raw(`DROP INDEX "payment_attempts_idempotency_key_unique"`);
        this.schema.raw(
            `CREATE UNIQUE INDEX "payment_attempts_idempotency_key_unique" ON "payment_attempts" ("tenant_id", "idempotency_key") WHERE (idempotency_key IS NOT NULL)`,
        );

        this.schema.raw(`DROP INDEX "shipping_zones_one_fallback_unique"`);
        this.schema.raw(
            `CREATE UNIQUE INDEX "shipping_zones_one_fallback_unique" ON "shipping_zones" ("tenant_id") WHERE (is_fallback = true)`,
        );
    }

    async down() {
        /**
         * Best-effort reversal (the wave is forward-only in practice — pre-prod rebuilds from
         * empty). Drops policies + RLS + tenant_id from every swept table and restores the original
         * global uniques where feasible.
         */
        const drop = (table: string) => {
            this.schema.raw(`DROP POLICY IF EXISTS "tenant_isolation" ON "${table}"`);
            this.schema.raw(`ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);
        };

        for (const table of this.tenantTables) {
            drop(table);
            this.schema.raw(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "tenant_id"`);
        }

        drop("users");

        drop("settings");
        this.schema.raw(`ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey"`);
        this.schema.raw(`ALTER TABLE "settings" DROP COLUMN IF EXISTS "tenant_id"`);
        this.schema.raw(`ALTER TABLE "settings" ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("group_key", "key")`);
    }
}
