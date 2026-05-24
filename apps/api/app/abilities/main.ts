import { Bouncer } from "@adonisjs/bouncer";

import type Order from "#models/order";
import type Product from "#models/product";
import type ProductExport from "#models/product_export";
import type ProductImport from "#models/product_import";
import type User from "#models/user";

/**
 * Resolve the {@link User#customer} relation on demand. The account-side routes accept
 * regular customers whose ownership is keyed off `customer_id` (one User has at most one
 * Customer profile), so most abilities need it but admins do not. Returns `null` when the
 * relation has nothing to load (e.g. the actor is an admin who never had a Customer row).
 */
async function customerOf(user: User) {
    if (!user.customer) await user.load("customer");
    return user.customer ?? null;
}

const isAdmin = (user: User) => user.role === "admin";

/**
 * Read an order. Admins see every order; a customer only sees the rows whose `customer_id`
 * matches their own profile. Cross-tenant access produces 403 — not the legacy 404. The
 * trade-off (enumeration via status code) is intentional, see `apps/api/AGENTS.md`.
 */
export const viewOrder = Bouncer.ability(async (user: User, order: Order) => {
    if (isAdmin(user)) return true;
    const customer = await customerOf(user);
    return customer ? Number(order.customerId) === Number(customer.id) : false;
});

/**
 * Cancel an order. Same allow-list as {@link viewOrder}; downstream state-machine guards
 * still reject cancellations that violate the lifecycle (e.g. already shipped).
 */
export const cancelOrder = Bouncer.ability(async (user: User, order: Order) => {
    if (isAdmin(user)) return true;
    const customer = await customerOf(user);
    return customer ? Number(order.customerId) === Number(customer.id) : false;
});

/** Issue a refund. Admin-only. */
export const refundOrder = Bouncer.ability((user: User) => isAdmin(user));

/** Edit line items, totals, addresses, or shipping on an existing order. Admin-only. */
export const editOrder = Bouncer.ability((user: User) => isAdmin(user));

/** Read a customer's admin record (segments, notes, lifetime value, …). Admin-only. */
export const viewCustomer = Bouncer.ability((user: User) => isAdmin(user));

/** Edit a customer's profile, status, or marketing prefs from the admin surface. Admin-only. */
export const editCustomer = Bouncer.ability((user: User) => isAdmin(user));

/** Begin an admin impersonation session on behalf of a customer. Admin-only. */
export const impersonateCustomer = Bouncer.ability((user: User) => isAdmin(user));

/** Merge two customer records into one. Admin-only. */
export const mergeCustomer = Bouncer.ability((user: User) => isAdmin(user));

/**
 * Read a product. Guests + customers see published, non-trashed rows; admins see everything
 * including drafts and trashed rows. The storefront query is normally filtered at the SQL
 * layer (see `Product.published`), so this ability is mostly for admin-side detail views.
 */
export const viewProduct = Bouncer.ability({ allowGuest: true }, (user: User | null, product: Product) => {
    if (product.deletedAt) return user?.role === "admin";
    if (product.status === "publish") return true;
    return user?.role === "admin";
});

/** Mutate a product (price, stock, copy, categories, …). Admin-only. */
export const editProduct = Bouncer.ability((user: User) => isAdmin(user));

/** Soft-delete a product. Admin-only. */
export const deleteProduct = Bouncer.ability((user: User) => isAdmin(user));

/**
 * Product imports/exports are owned by the admin who started them. Another admin (even with
 * the same role) should not see, cancel, or download a colleague's job — the rows hold a
 * preview/audit of someone else's catalog work.
 */
export const viewImport = Bouncer.ability((user: User, row: ProductImport) => Number(row.userId) === Number(user.id));

/** Abort an in-flight import. Owner only. */
export const cancelImport = Bouncer.ability((user: User, row: ProductImport) => Number(row.userId) === Number(user.id));

/** Roll an import back via its change-set ledger. Owner only. */
export const rollbackImport = Bouncer.ability((user: User, row: ProductImport) => Number(row.userId) === Number(user.id));

/** Read an export row (status, manifest, signed link). Owner only. */
export const viewExport = Bouncer.ability((user: User, row: ProductExport) => Number(row.userId) === Number(user.id));

/** Abort an in-flight export. Owner only. */
export const cancelExport = Bouncer.ability((user: User, row: ProductExport) => Number(row.userId) === Number(user.id));

/** Generate a signed-URL download for a completed export. Owner only. */
export const downloadExport = Bouncer.ability((user: User, row: ProductExport) => Number(row.userId) === Number(user.id));

/**
 * Generic admin gate for endpoints with no per-row owner — duplicates `admin_middleware`'s
 * role check at the controller layer so policies can compose with it (e.g. an audit endpoint
 * that wants `bouncer.authorize(adminOnly)` then a further per-record check).
 */
export const adminOnly = Bouncer.ability((user: User) => isAdmin(user));
