/**
 * Parity check for src/lib/matching: every instrumented trace must end at
 * exactly the same answer as the engine code it instruments.
 *
 *   node --experimental-strip-types scripts/matching/check_traces.mts
 *
 * 1. seedTrace(a, b).spans === pairRun(a, b).spans, in whichever orientation
 *    pairRun picked (fwd for KH0303/KH0304, reversed for KH0121/KH0473).
 * 2. swTrace(a, b, ic).best.score === swBest(a, b, ic).score (KH0303/KH0304,
 *    where forward is the winning orientation).
 * 3. sumTrace(pendantValues(k)).sums === pendantSums(pendantValues(k)), on
 *    KH0081 and KH0698.
 * 4. fisherYates(n, rng).perm === shuffleInPlace(identity, rng) for the same
 *    seed.
 *
 * Exit status 1 on any mismatch.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCorpus, icOf } from "../../src/lib/engine/corpus.ts";
import { mulberry32, shuffleInPlace } from "../../src/lib/engine/rng.ts";
import { swBest } from "../../src/lib/engine/tests/align.ts";
import { pairRun } from "../../src/lib/engine/tests/passages.ts";
import type { CorpusLiteFile } from "../../src/lib/next/types.ts";
import { fisherYates } from "../../src/lib/matching/shuffleTrace.ts";
import { seedTrace } from "../../src/lib/matching/seedTrace.ts";
import { sumTrace } from "../../src/lib/matching/sumTrace.ts";
import { swTrace } from "../../src/lib/matching/swTrace.ts";
import { valuesOf } from "../../src/lib/matching/tape.ts";
import { pendantSums, pendantValues } from "../../src/lib/stories/chance.ts";
import type { Khipu } from "../../src/lib/khipu/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const khipu = (id: string): Khipu =>
	JSON.parse(
		readFileSync(join(root, "public", "data", "khipus", `${id}.json`), "utf8"),
	);
const corpusLite: CorpusLiteFile = JSON.parse(
	readFileSync(
		join(root, "public", "data", "next", "corpus-lite.json"),
		"utf8",
	),
);

let failures = 0;
const ok = (msg: string) => console.log(`  ok   ${msg}`);
const fail = (msg: string) => {
	failures++;
	console.log(`  FAIL ${msg}`);
};
const sameSpans = (
	a: [number, number, number][],
	b: [number, number, number][],
) => JSON.stringify(a) === JSON.stringify(b);

/* ─────────── 1. seedTrace vs pairRun ─────────── */

console.log("seedTrace vs pairRun");
for (const [ida, idb, wantDir] of [
	["KH0303", "KH0304", "fwd"],
	["KH0121", "KH0473", "rev"],
] as const) {
	const a = valuesOf(khipu(ida));
	const b = valuesOf(khipu(idb));
	const pr = pairRun(a, b);
	if (pr.dir !== wantDir) {
		fail(
			`${ida}/${idb}: pairRun dir is ${pr.dir}, expected ${wantDir} (test picked the wrong pair to assume this of)`,
		);
		continue;
	}
	const st = seedTrace(a, b, {
		W: "5+4",
		minMax: 15,
		reverseB: pr.dir === "rev",
	});
	const msg = `${ida}/${idb} (${pr.dir}): seedTrace ${st.spans.length} spans, pairRun ${pr.spans.length}, longest ${pr.longest}`;
	if (sameSpans(st.spans, pr.spans)) ok(msg);
	else {
		fail(msg);
		console.log("       seedTrace:", JSON.stringify(st.spans.slice(0, 5)));
		console.log("       pairRun:  ", JSON.stringify(pr.spans.slice(0, 5)));
	}
}

/* ─────────── 2. swTrace vs swBest ─────────── */

console.log("\nswTrace vs swBest");
{
	const c = parseCorpus(corpusLite);
	const ic = icOf(c);
	const ka = c.byId.get("KH0303");
	const kb = c.byId.get("KH0304");
	if (!ka || !kb) fail("KH0303/KH0304 missing from corpus-lite.json");
	else {
		const want = swBest(ka.seq, kb.seq, ic);
		const st = swTrace(ka.seq, kb.seq, ic);
		const msg = `KH0303/KH0304: swTrace best ${st.best.score.toFixed(3)} at (${st.best.i},${st.best.j}), swBest ${want.score.toFixed(3)} dir ${want.dir}`;
		// swBest's substitution table is Float32 ("like the C kernel", align.ts);
		// swTrace computes in full double precision, so scores agree to ~1e-6
		// relative, not bit-for-bit.
		if (want.dir === "fwd" && Math.abs(st.best.score - want.score) < 1e-4)
			ok(msg);
		else fail(msg);
	}
}

/* ─────────── 2b. every printed path rescores to its end cell ─────────── */

console.log("\nswTrace path rescoring (Gotoh gap states)");
{
	const c = parseCorpus(corpusLite);
	const ic = icOf(c);
	const { mulberry32 } = await import("../../src/lib/engine/rng.ts");
	const { subScoreP, traceFrom } = await import("../../src/lib/matching/swTrace.ts");
	const rescore = (
		t: ReturnType<typeof swTrace>,
		path: { i: number; j: number; op: string }[],
	) => {
		let s = 0;
		let prev = "";
		for (const st of path) {
			if (st.op === "gapA" || st.op === "gapB") {
				s -= prev === st.op ? t.params.ge : t.params.go;
			} else s += subScoreP(t.a[st.i - 1], t.b[st.j - 1], ic, t.params);
			prev = st.op;
		}
		return s;
	};
	const rng = mulberry32(20261031);
	const alphabet = [0, 0, 1, 2, 3, 10, 11, 12, 21, 100, 101, 110, 230, 320];
	let bad = 0;
	let total = 0;
	const settings = [{}, { go: 1, ge: 0.25 }, { go: 2, ge: 2 }, { slipw: 1 }];
	for (let r = 0; r < 2000; r++) {
		const n = 4 + Math.floor(rng() * 24);
		const m = 4 + Math.floor(rng() * 24);
		const a = Array.from({ length: n }, () => alphabet[Math.floor(rng() * alphabet.length)]);
		// b: a mutated copy of a (indels, slips) so gaps actually occur
		const b: number[] = [];
		for (const v of a) {
			const u = rng();
			if (u < 0.12) continue;
			if (u < 0.24) b.push(alphabet[Math.floor(rng() * alphabet.length)]);
			b.push(u < 0.32 ? v + 1 : v);
		}
		while (b.length < m) b.push(alphabet[Math.floor(rng() * alphabet.length)]);
		const t = swTrace(a, b, ic, settings[r % settings.length]);
		total++;
		if (Math.abs(rescore(t, t.path) - t.best.score) > 1e-9) bad++;
		// and a clicked cell
		const ci = 1 + Math.floor(rng() * t.n);
		const cj = 1 + Math.floor(rng() * t.m);
		const h = t.H[ci * (t.m + 1) + cj];
		total++;
		if (Math.abs(rescore(t, traceFrom(t, ic, ci, cj)) - h) > 1e-9) bad++;
	}
	const msg = `${total} paths (best cells + clicked cells, 4 slider settings): ${bad} rescore wrong`;
	if (bad === 0) ok(msg);
	else fail(msg);
}

/* ─────────── 3. sumTrace vs pendantSums ─────────── */

console.log("\nsumTrace vs pendantSums");
for (const id of ["KH0081", "KH0698"]) {
	const v = pendantValues(khipu(id));
	const want = pendantSums(v);
	const got = sumTrace(v).sums;
	const msg = `${id}: sumTrace ${got.length} sums, pendantSums ${want.length}`;
	if (JSON.stringify(got) === JSON.stringify(want)) ok(msg);
	else {
		fail(msg);
		console.log("       sumTrace:   ", JSON.stringify(got.slice(0, 5)));
		console.log("       pendantSums:", JSON.stringify(want.slice(0, 5)));
	}
}

/* ─────────── 4. fisherYates vs shuffleInPlace ─────────── */

console.log("\nfisherYates vs shuffleInPlace");
for (const seed of [1, 20260924, 7]) {
	const n = 37;
	const arr = Int32Array.from({ length: n }, (_, i) => i);
	shuffleInPlace(arr, mulberry32(seed));
	const { perm } = fisherYates(n, mulberry32(seed));
	const same = arr.length === perm.length && arr.every((v, i) => v === perm[i]);
	const msg = `seed ${seed}, n ${n}: ${same ? "identical" : "DIFFER"}`;
	if (same) ok(msg);
	else fail(msg);
}

console.log(`\n${failures === 0 ? "ALL OK" : `${failures} failure(s)`}`);
process.exit(failures === 0 ? 0 : 1);
