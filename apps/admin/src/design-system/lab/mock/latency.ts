/**
 * Latency helpers for showcase demos. Every async-aware primitive's `*.demo.tsx` uses these to
 * simulate real network behaviour (loading spinners, jitter, failures) without wiring the demos
 * to live API calls. Keep the defaults visible but unannoying — 400ms is long enough to see the
 * loader land, short enough not to test the operator's patience.
 */

/** Resolve after `ms`. Default 400 ms. */
export function delay(ms = 400): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wrap a value in a promise that resolves after `ms`. */
export function withLatency<T>(value: T, ms = 400): Promise<T> {
    return delay(ms).then(() => value);
}

/**
 * Random latency between `[min, max]` ms. Simulates real network jitter so the operator can feel
 * how a primitive holds up under variance — comboboxes especially benefit from this demo.
 */
export function withRandomLatency<T>(value: T, [min, max]: [number, number] = [200, 1800]): Promise<T> {
    const ms = Math.floor(Math.random() * (max - min)) + min;
    return withLatency(value, ms);
}

/**
 * Promise that rejects `rate * 100%` of the time after `ms`. `rate = 1` always rejects; `rate = 0.5`
 * is 50/50. Used by error-state demos and retry-flow demos.
 */
export function withFailure<T>(value: T, rate = 1, ms = 400): Promise<T> {
    return delay(ms).then(() => {
        if (Math.random() < rate) {
            throw new Error("Mock failure");
        }
        return value;
    });
}
