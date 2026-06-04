/**
 * Lightweight fuzzy matcher for the command palette. Returns a score (higher = better) when
 * `query` matches `text`, or `null` when it doesn't. A contiguous substring scores highest; a
 * subsequence match scores by how tightly the characters cluster and whether they land on word
 * boundaries. Sufficient for a small fleet — no need for a fuzzy-search dependency.
 */
export function fuzzyScore(query: string, text: string): number | null {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return 0;
    const t = text.toLowerCase();

    const direct = t.indexOf(q);
    if (direct !== -1) return 1000 - direct;

    let qi = 0;
    let score = 0;
    let prevIndex = -2;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t[ti] !== q[qi]) continue;
        score += prevIndex === ti - 1 ? 6 : 1;
        const boundary = ti === 0 || t[ti - 1] === " " || t[ti - 1] === "-" || t[ti - 1] === ".";
        if (boundary) score += 4;
        prevIndex = ti;
        qi++;
    }
    return qi === q.length ? score : null;
}
