/**
 * Tiny in-process metrics registry. Hand-rolled deliberately — the surface we need is small and
 * a direct `prom-client` dependency was rejected at design time. If this ever grows past ~30
 * series total, swap to prom-client and delete most of this file.
 *
 * Mental model: each metric (counter / gauge / histogram) owns a `Map` keyed by a stable
 * serialization of its label values. {@link renderPrometheusText} walks every registered metric
 * and emits Prometheus exposition-format text. {@link resetMetrics} clears every series; Japa
 * tests call it between specs.
 *
 * Cardinality is the caller's responsibility — label values come from closed enums (gateway
 * codes, order statuses, cache tag names, queue names, etc.), never from raw user input or
 * cache keys.
 */

const LABEL_VALUE_ESCAPE = /[\\"\n]/g;

/** Escape a Prometheus label value per the exposition format. */
function escapeLabelValue(value: string): string {
    return value.replace(LABEL_VALUE_ESCAPE, (ch) => {
        if (ch === "\\") return "\\\\";
        if (ch === '"') return '\\"';
        return "\\n";
    });
}

/**
 * Render a `{a="x",b="y"}` label suffix. Order matches the metric's declared `labelNames` so
 * series are deterministic across renders. Returns `""` when there are no labels.
 */
function renderLabels(labelNames: readonly string[], labelValues: readonly string[]): string {
    if (labelNames.length === 0) return "";
    const parts: string[] = [];
    for (let i = 0; i < labelNames.length; i++) {
        parts.push(`${labelNames[i]}="${escapeLabelValue(labelValues[i] ?? "")}"`);
    }
    return `{${parts.join(",")}}`;
}

/** Encode a label-value tuple as a single map key — `|` is escaped so it can't collide. */
function encodeLabelKey(labelValues: readonly string[]): string {
    return labelValues.map((v) => v.replace(/\\/g, "\\\\").replace(/\|/g, "\\|")).join("|");
}

interface BaseMetric {
    name: string;
    help: string;
    labelNames: readonly string[];
    render(lines: string[]): void;
    /**
     * Wipe collected observations. Re-applies any `seed()`-registered baselines so dashboards
     * still see `metric{...} 0` lines on a freshly-reset registry — Japa specs reset between
     * tests, and we don't want the first scrape after a spec to look like "no data".
     */
    reset(): void;
}

/** A monotonic counter. `inc(labels, delta=1)` adds to the bucket; never decreases. */
export interface Counter {
    inc(labelValues?: Record<string, string>, delta?: number): void;
    /**
     * Pre-seed a label combination at zero so the series is visible in `/metrics` before any
     * traffic exercises it. Without this, dashboards show "No data" until the first hit.
     */
    seed(labelValues?: Record<string, string>): void;
}

/** A point-in-time gauge. `set(labels, value)` overwrites the bucket. */
export interface Gauge {
    set(labelValues: Record<string, string> | undefined, value: number): void;
    /** Pre-seed a label combination at zero (see {@link Counter.seed}). */
    seed(labelValues?: Record<string, string>): void;
}

/**
 * A cumulative histogram. `observe(labels, value)` adds one observation to every bucket whose
 * upper bound is ≥ `value`, plus the count + sum. Buckets are declared at registration and never
 * change. The conventional `+Inf` bucket is appended automatically at render time.
 */
export interface Histogram {
    observe(labelValues: Record<string, string> | undefined, value: number): void;
    seed(labelValues?: Record<string, string>): void;
}

interface CounterMetric extends BaseMetric {
    type: "counter";
    samples: Map<string, { labelValues: string[]; value: number }>;
    seeds: Map<string, string[]>;
    handle: Counter;
}

interface GaugeMetric extends BaseMetric {
    type: "gauge";
    samples: Map<string, { labelValues: string[]; value: number }>;
    seeds: Map<string, string[]>;
    handle: Gauge;
}

interface HistogramSample {
    labelValues: string[];
    count: number;
    sum: number;
    buckets: number[];
}

interface HistogramMetric extends BaseMetric {
    type: "histogram";
    buckets: readonly number[];
    samples: Map<string, HistogramSample>;
    seeds: Map<string, string[]>;
    handle: Histogram;
}

type AnyMetric = CounterMetric | GaugeMetric | HistogramMetric;

/**
 * Pick the label values in declaration order so they always land in the same map slot regardless
 * of how the caller assembled the object literal. Missing values become `""`.
 */
function pickLabelValues(labelNames: readonly string[], labelValues: Record<string, string> | undefined): string[] {
    if (labelNames.length === 0) return [];
    const out: string[] = new Array(labelNames.length);
    for (let i = 0; i < labelNames.length; i++) {
        out[i] = labelValues?.[labelNames[i]] ?? "";
    }
    return out;
}

/**
 * Central registry. One instance lives in {@link metricsRegistry}; tests can construct their own
 * to assert against without poisoning the singleton.
 */
export class MetricRegistry {
    private metrics = new Map<string, AnyMetric>();

    /**
     * Register a counter. Same `name` registered twice returns the existing handle — Japa
     * test reloads re-import the module without clearing the registry.
     */
    counter(opts: { name: string; help: string; labelNames?: readonly string[] }): Counter {
        const existing = this.metrics.get(opts.name);
        if (existing) return (existing as CounterMetric).handle;
        const metric: CounterMetric = {
            type: "counter",
            name: opts.name,
            help: opts.help,
            labelNames: opts.labelNames ?? [],
            samples: new Map(),
            seeds: new Map(),
            handle: undefined as unknown as Counter,
            render(lines) {
                lines.push(`# HELP ${this.name} ${this.help}`);
                lines.push(`# TYPE ${this.name} counter`);
                if (this.samples.size === 0) {
                    if (this.labelNames.length === 0) lines.push(`${this.name} 0`);
                    return;
                }
                for (const sample of this.samples.values()) {
                    lines.push(`${this.name}${renderLabels(this.labelNames, sample.labelValues)} ${sample.value}`);
                }
            },
            reset() {
                this.samples.clear();
                for (const [key, labelValues] of this.seeds) {
                    this.samples.set(key, { labelValues, value: 0 });
                }
            },
        };
        metric.handle = {
            inc: (labelValues, delta = 1) => {
                if (delta < 0) return;
                const values = pickLabelValues(metric.labelNames, labelValues);
                const key = encodeLabelKey(values);
                const sample = metric.samples.get(key);
                if (sample) {
                    sample.value += delta;
                } else {
                    metric.samples.set(key, { labelValues: values, value: delta });
                }
            },
            seed: (labelValues) => {
                const values = pickLabelValues(metric.labelNames, labelValues);
                const key = encodeLabelKey(values);
                if (!metric.seeds.has(key)) metric.seeds.set(key, values);
                if (!metric.samples.has(key)) {
                    metric.samples.set(key, { labelValues: values, value: 0 });
                }
            },
        };
        this.metrics.set(opts.name, metric);
        return metric.handle;
    }

    gauge(opts: { name: string; help: string; labelNames?: readonly string[] }): Gauge {
        const existing = this.metrics.get(opts.name);
        if (existing) return (existing as GaugeMetric).handle;
        const metric: GaugeMetric = {
            type: "gauge",
            name: opts.name,
            help: opts.help,
            labelNames: opts.labelNames ?? [],
            samples: new Map(),
            seeds: new Map(),
            handle: undefined as unknown as Gauge,
            render(lines) {
                lines.push(`# HELP ${this.name} ${this.help}`);
                lines.push(`# TYPE ${this.name} gauge`);
                if (this.samples.size === 0) {
                    if (this.labelNames.length === 0) lines.push(`${this.name} 0`);
                    return;
                }
                for (const sample of this.samples.values()) {
                    lines.push(`${this.name}${renderLabels(this.labelNames, sample.labelValues)} ${formatNumber(sample.value)}`);
                }
            },
            reset() {
                this.samples.clear();
                for (const [key, labelValues] of this.seeds) {
                    this.samples.set(key, { labelValues, value: 0 });
                }
            },
        };
        metric.handle = {
            set: (labelValues, value) => {
                if (!Number.isFinite(value)) return;
                const values = pickLabelValues(metric.labelNames, labelValues);
                const key = encodeLabelKey(values);
                metric.samples.set(key, { labelValues: values, value });
            },
            seed: (labelValues) => {
                const values = pickLabelValues(metric.labelNames, labelValues);
                const key = encodeLabelKey(values);
                if (!metric.seeds.has(key)) metric.seeds.set(key, values);
                if (!metric.samples.has(key)) {
                    metric.samples.set(key, { labelValues: values, value: 0 });
                }
            },
        };
        this.metrics.set(opts.name, metric);
        return metric.handle;
    }

    histogram(opts: { name: string; help: string; labelNames?: readonly string[]; buckets: readonly number[] }): Histogram {
        const existing = this.metrics.get(opts.name);
        if (existing) return (existing as HistogramMetric).handle;
        const sortedBuckets = Object.freeze([...opts.buckets].sort((a, b) => a - b));
        const metric: HistogramMetric = {
            type: "histogram",
            name: opts.name,
            help: opts.help,
            labelNames: opts.labelNames ?? [],
            buckets: sortedBuckets,
            samples: new Map(),
            seeds: new Map(),
            handle: undefined as unknown as Histogram,
            render(lines) {
                lines.push(`# HELP ${this.name} ${this.help}`);
                lines.push(`# TYPE ${this.name} histogram`);
                if (this.samples.size === 0) {
                    return;
                }
                for (const sample of this.samples.values()) {
                    const labelSuffix = renderLabels(this.labelNames, sample.labelValues);
                    for (let i = 0; i < sortedBuckets.length; i++) {
                        const labels = bucketLabels(this.labelNames, sample.labelValues, String(sortedBuckets[i]));
                        lines.push(`${this.name}_bucket${labels} ${sample.buckets[i]}`);
                    }
                    const infLabels = bucketLabels(this.labelNames, sample.labelValues, "+Inf");
                    lines.push(`${this.name}_bucket${infLabels} ${sample.count}`);
                    lines.push(`${this.name}_count${labelSuffix} ${sample.count}`);
                    lines.push(`${this.name}_sum${labelSuffix} ${formatNumber(sample.sum)}`);
                }
            },
            reset() {
                this.samples.clear();
                for (const [key, labelValues] of this.seeds) {
                    this.samples.set(key, { labelValues, count: 0, sum: 0, buckets: sortedBuckets.map(() => 0) });
                }
            },
        };
        metric.handle = {
            observe: (labelValues, value) => {
                if (!Number.isFinite(value) || value < 0) return;
                const values = pickLabelValues(metric.labelNames, labelValues);
                const key = encodeLabelKey(values);
                let sample = metric.samples.get(key);
                if (!sample) {
                    sample = { labelValues: values, count: 0, sum: 0, buckets: sortedBuckets.map(() => 0) };
                    metric.samples.set(key, sample);
                }
                sample.count += 1;
                sample.sum += value;
                for (let i = 0; i < sortedBuckets.length; i++) {
                    if (value <= sortedBuckets[i]) sample.buckets[i] += 1;
                }
            },
            seed: (labelValues) => {
                const values = pickLabelValues(metric.labelNames, labelValues);
                const key = encodeLabelKey(values);
                if (!metric.seeds.has(key)) metric.seeds.set(key, values);
                if (!metric.samples.has(key)) {
                    metric.samples.set(key, { labelValues: values, count: 0, sum: 0, buckets: sortedBuckets.map(() => 0) });
                }
            },
        };
        this.metrics.set(opts.name, metric);
        return metric.handle;
    }

    /**
     * Run an external collector (e.g. `process.memoryUsage()`) right before render. Used by Node
     * runtime gauges and the queue-depth gauge so the values are fresh at scrape time without
     * paying for a setInterval.
     */
    onBeforeRender(collector: () => void | Promise<void>): void {
        this.collectors.push(collector);
    }
    private collectors: Array<() => void | Promise<void>> = [];

    async render(): Promise<string> {
        for (const collector of this.collectors) {
            try {
                await collector();
            } catch {
                /** Collector failures must never fail a scrape — keep emitting whatever we have. */
            }
        }
        const lines: string[] = [];
        for (const metric of this.metrics.values()) {
            metric.render(lines);
        }
        return `${lines.join("\n")}\n`;
    }

    /** Clear every series across every metric. Tests call this between specs. */
    reset(): void {
        for (const metric of this.metrics.values()) {
            metric.reset();
        }
    }

    /** Inspection helper for tests — list every registered metric name. */
    metricNames(): string[] {
        return Array.from(this.metrics.keys()).sort();
    }
}

function bucketLabels(labelNames: readonly string[], labelValues: readonly string[], le: string): string {
    const parts: string[] = [];
    for (let i = 0; i < labelNames.length; i++) {
        parts.push(`${labelNames[i]}="${escapeLabelValue(labelValues[i] ?? "")}"`);
    }
    parts.push(`le="${le}"`);
    return `{${parts.join(",")}}`;
}

/**
 * Prometheus format wants integers without decimals and floats with up to six. Avoiding
 * `toString()` here keeps `1e21` out of large counter values that grafana otherwise misparses.
 */
function formatNumber(value: number): string {
    if (!Number.isFinite(value)) return "0";
    if (Number.isInteger(value)) return value.toString(10);
    return value.toFixed(6);
}

/** Singleton — every domain helper writes through this instance. */
export const metricsRegistry = new MetricRegistry();
