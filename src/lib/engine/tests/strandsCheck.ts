/**
 * Every per-cord thread of strands.json checked against the corpus values.
 * Node-importable; needs `c.strands` (attached by the loaders).
 *
 * A thread end is verifiable when it names one level-1 cord (its value must
 * equal va / vb), several cords of a "sum" or "scaled" thread (their sum must
 * equal the recorded value), or one subsidiary "pNsK" of its pendant (the
 * K-th direct subsidiary must equal it). Nested subsidiaries, several named
 * subsidiaries, several cords of any other kind, and a missing value are
 * unverifiable. Thread indices of `a` refer to khipu link.a (strands.json
 * keeps the curated orientation, not pairKey order).
 */
import type {
	CorpusLite,
	Executor,
	Hit,
	KhipuLite,
	Observation,
} from "../../next/types.ts";
import type { StrandThread } from "../../stories/strands.ts";

type EndResult = "ok" | "bad" | "unverifiable";

const SUB = /^p\d+s(\d+)$/;

function same(x: number, y: number): boolean {
	return Math.abs(x - y) < 1e-9 || Math.trunc(x) === Math.trunc(y);
}

function checkEnd(
	k: KhipuLite | undefined,
	idx: number[],
	value: number | null | undefined,
	sub: string[] | undefined,
	kind: StrandThread["kind"],
): EndResult {
	if (!k || value == null || !Number.isFinite(value) || idx.length === 0)
		return "unverifiable";
	if (idx.some((i) => i < 0 || i >= k.seq.length)) return "bad";
	if (sub && sub.length > 0) {
		if (sub.length !== 1 || idx.length !== 1) return "unverifiable";
		const m = SUB.exec(sub[0]);
		if (!m) return "unverifiable";
		const vs = k.subs.get(idx[0]);
		const v = vs?.[Number(m[1]) - 1];
		if (v == null) return "bad";
		return same(v, value) ? "ok" : "bad";
	}
	if (idx.length === 1) return same(k.seq[idx[0]], value) ? "ok" : "bad";
	if (kind !== "sum" && kind !== "scaled") return "unverifiable";
	let s = 0;
	for (const i of idx) s += k.seq[i];
	return same(s, value) ? "ok" : "bad";
}

export interface StrandsTally {
	verified: number;
	verifiable: number;
	unverifiable: number;
	failures: Hit[];
}

export function checkStrands(c: CorpusLite): StrandsTally {
	const out: StrandsTally = {
		verified: 0,
		verifiable: 0,
		unverifiable: 0,
		failures: [],
	};
	const links = c.strands?.links ?? {};
	for (const key of Object.keys(links).sort()) {
		const l = links[key];
		const A = c.byId.get(l.a);
		const B = c.byId.get(l.b);
		l.threads.forEach((t, n) => {
			const ra = checkEnd(A, t.a, t.va, t.subA, t.kind);
			const rb = checkEnd(B, t.b, t.vb, t.subB, t.kind);
			if (ra === "unverifiable" || rb === "unverifiable") {
				out.unverifiable++;
				return;
			}
			out.verifiable++;
			if (ra === "ok" && rb === "ok") {
				out.verified++;
				return;
			}
			const got = (k: KhipuLite | undefined, idx: number[]) =>
				k ? idx.map((i) => k.seq[i]).join("+") : "?";
			out.failures.push({
				ids: [l.a, l.b],
				at: [t.a, t.b],
				value: n,
				label: `${key} thread ${n + 1} (${t.kind}): recorded ${t.va}/${t.vb}, corpus ${got(A, t.a)}/${got(B, t.b)}`,
			});
		});
	}
	return out;
}

/** share of verifiable threads whose recorded values match the corpus */
export const strandsVerifiedExec: Executor = {
	scope: "corpus",
	nullKind: "none",
	observe(c: CorpusLite): Observation {
		if (!c.strands)
			throw new Error("strands.json is not attached to the corpus");
		const t = checkStrands(c);
		return {
			value: t.verifiable ? t.verified / t.verifiable : 0,
			hits: t.failures,
			detail: {
				verified: t.verified,
				verifiable: t.verifiable,
				unverifiable: t.unverifiable,
				links: Object.keys(c.strands.links).length,
			},
		};
	},
};
