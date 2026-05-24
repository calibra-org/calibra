import emitter from "@adonisjs/core/services/emitter";
import { test } from "@japa/runner";

import AdminActionPerformed from "#events/admin_action_performed";
import AdminAuditLog from "#models/admin_audit_log";
import User from "#models/user";
import { truncatePhase03Tables } from "#tests/helpers/db";

/**
 * Domain-event smoke. Demonstrates the framework's `emitter.fake()` for `assertEmitted`,
 * plus the live listener actually writing the audit row. Covers both the "we emitted it"
 * unit angle and the "the row landed" functional angle.
 */
test.group("AdminActionPerformed", (group) => {
    group.each.setup(async () => {
        await truncatePhase03Tables();
    });

    test("event dispatch is captured by emitter.fake()", async ({ assert, cleanup }) => {
        const fake = emitter.fake([AdminActionPerformed]);
        cleanup(() => emitter.restore());

        await AdminActionPerformed.dispatch({
            actorUserId: 42,
            action: "test.action",
            entityKind: "order",
            entityId: 1,
        });

        fake.assertEmitted(AdminActionPerformed, ({ data }) => data.payload.action === "test.action");
        assert.isTrue(true);
    });

    test("listener writes an admin_audit_log row when the event fires", async ({ assert }) => {
        const actor = await User.create({
            email: "audit-listener@calibra.dev",
            passwordHash: "Passw0rd1!",
            role: "admin",
            locale: "fa",
        });

        await AdminActionPerformed.dispatch({
            actorUserId: Number(actor.id),
            action: "listener.smoke",
            entityKind: "order",
            entityId: 7,
            payload: { note: "from spec" },
        });

        /** Give the bus one tick to settle in case the listener is enqueued via microtask. */
        await new Promise<void>((resolve) => setImmediate(resolve));
        const row = await AdminAuditLog.query().where("action", "listener.smoke").first();
        assert.isNotNull(row);
        assert.equal(Number(row?.actorUserId), Number(actor.id));
        assert.deepEqual(row?.payload, { note: "from spec" });
    });
});
