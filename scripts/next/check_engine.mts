/**
 * Parity, determinism and replication check for the /next engine.
 *
 *   node --experimental-strip-types scripts/next/check_engine.mts [--quick] [--strict] [--only id,id] [--json out.json]
 *
 * 1. Parity (exact): the passage scan equals public/data/stories/links.json
 *    (58 pairs, split 24/7/27, identical a/b/dir/longest/spans); the profile
 *    observed counts equal profiles.json on every testable khipu; r1, r1adj
 *    and r9 observed equal chance.json.
 * 2. Determinism: runHypothesis(r1, R=20) twice gives identical nulls.
 * 3. Replication: every registry entry with a recorded expectation is run at
 *    its R (--quick: R/5, at least 20; profileCounts skipped) and judged.
 *
 * Exit status 1 on any parity failure, or any drift / contradicts verdict
 * that is not a KNOWN finding below (--strict counts those too). A known
 * finding is still printed; it stops failing the run only while its verdict
 * stays one of the listed ones.
 * Run it after scripts/next/build_corpus.py whenever the data changes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCorpus } from "../../src/lib/engine/corpus.ts";
import {
	DEFAULT_SEED,
	judge,
	runHypothesis,
} from "../../src/lib/engine/hypothesis.ts";
import {
	getExecutor,
	getHypothesis,
	HYPOTHESES,
} from "../../src/lib/engine/registry.ts";
import {
	longestByPair,
	scanCorpus,
} from "../../src/lib/engine/tests/passages.ts";
import { profileObserved } from "../../src/lib/engine/tests/profile.ts";
import type { CorpusLiteFile, RunResult } from "../../src/lib/next/types.ts";
import type { StrandFile } from "../../src/lib/stories/strands.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const data = (p: string) =>
	JSON.parse(readFileSync(join(root, "public", "data", p), "utf8"));

const argv = process.argv.slice(2);
const quick = argv.includes("--quick");
const strict = argv.includes("--strict");
const onlyArg = argv.indexOf("--only");
const only =
	onlyArg >= 0
		? new Set((argv[onlyArg + 1] ?? "").split(",").filter(Boolean))
		: null;
const jsonArg = argv.indexOf("--json");
const jsonOut = jsonArg >= 0 ? argv[jsonArg + 1] : null;

let failures = 0;
const fail = (msg: string) => {
	failures++;
	console.log(`  FAIL ${msg}`);
};
const ok = (msg: string) => console.log(`  ok   ${msg}`);

/* ─────────── setup ─────────── */

const t0 = performance.now();
const raw = data("next/corpus-lite.json") as CorpusLiteFile;
const strands = data("stories/strands.json") as StrandFile;
const links = data("stories/links.json") as {
	baseline: Record<string, { observed: number; shuffled: number }>;
	pairs: {
		a: string;
		b: string;
		dir: string;
		values: number;
		runs: number;
		longest: number;
		spans: number[][];
	}[];
};
const chance = data("stories/chance.json") as {
	relations: Record<string, { obs: number; null: number; sd: number }>;
};
const profiles = data("profiles.json") as {
	profiles: Record<
		string,
		{ arithmetic: { tests?: Record<string, { observed: number }> } }
	>;
};
const c = parseCorpus(raw, strands);
console.log(
	`corpus ${c.khipus.length} khipus, data ${c.dataHash.slice(0, 12)}, parsed in ${Math.round(performance.now() - t0)} ms${quick ? " (quick)" : ""}`,
);

/* ─────────── 1. parity ─────────── */

console.log("\nparity");
{
	const t = performance.now();
	const rows = scanCorpus(c);
	const ms = Math.round(performance.now() - t);
	const best = longestByPair(rows);
	const split = [0, 0, 0];
	for (const v of best.values()) {
		if (v >= 6) split[0]++;
		else if (v === 5) split[1]++;
		else if (v === 4) split[2]++;
	}
	const want = [
		links.baseline["6"].observed,
		links.baseline["5"].observed,
		links.baseline["4"].observed,
	];
	const key = (r: { a: string; b: string; dir: string }) =>
		`${r.a}|${r.b}|${r.dir}`;
	const mine = new Map(rows.map((r) => [key(r), r]));
	let same = 0;
	const diffs: string[] = [];
	for (const p of links.pairs) {
		const r = mine.get(key(p));
		if (!r) {
			diffs.push(`missing ${key(p)}`);
			continue;
		}
		if (
			r.longest === p.longest &&
			r.values === p.values &&
			r.runs === p.runs &&
			JSON.stringify(r.spans) === JSON.stringify(p.spans)
		)
			same++;
		else diffs.push(`differs ${key(p)}`);
	}
	for (const r of rows)
		if (!links.pairs.some((p) => key(p) === key(r)))
			diffs.push(`extra ${key(r)}`);
	const msg = `scan ${rows.length} pairs (links.json ${links.pairs.length}), split ${split.join("/")} (recorded ${want.join("/")}), ${same} identical, ${ms} ms`;
	if (
		rows.length === links.pairs.length &&
		same === links.pairs.length &&
		split.join() === want.join() &&
		diffs.length === 0
	)
		ok(msg);
	else {
		fail(msg);
		for (const d of diffs.slice(0, 10)) console.log(`       ${d}`);
	}
}
{
	let tested = 0;
	let match = 0;
	const bad: string[] = [];
	for (const [id, p] of Object.entries(profiles.profiles)) {
		const tests = p.arithmetic.tests;
		if (!tests) continue;
		tested++;
		const k = c.byId.get(id);
		if (!k) {
			bad.push(`${id} missing`);
			continue;
		}
		const o = profileObserved(k) as Record<string, number | null>;
		const diff = Object.entries(tests).filter(
			([name, t]) => o[name] !== t.observed,
		);
		if (diff.length === 0) match++;
		else
			bad.push(
				`${id} ${diff.map(([n, t]) => `${n} ${o[n]}≠${t.observed}`).join(", ")}`,
			);
	}
	const msg = `profiles observed ${match} of ${tested}`;
	if (tested > 0 && match === tested) ok(msg);
	else {
		fail(msg);
		for (const b of bad.slice(0, 10)) console.log(`       ${b}`);
	}
}
for (const id of ["r1", "r1adj", "r9"]) {
	const h = getHypothesis(id);
	if (!h) {
		fail(`${id} not in the registry`);
		continue;
	}
	const o = getExecutor(id).observe(c, h.defaultSpec).value;
	const want = chance.relations[id].obs;
	if (o === want) ok(`${id} observed ${o} (chance.json ${want})`);
	else fail(`${id} observed ${o}, chance.json ${want}`);
}
{
	const h = getHypothesis("pair:KH0001|KH0002");
	if (h && h.scope === "pair" && h.ids?.join() === "KH0001,KH0002")
		ok(`getHypothesis("pair:KH0001|KH0002") synthesises ${h.id} (R ${h.R})`);
	else fail("getHypothesis did not synthesise pair:KH0001|KH0002");
}

/* ─────────── 2. determinism ─────────── */

console.log("\ndeterminism");
{
	const a = await runHypothesis(c, { hypothesisId: "r1", R: 20 });
	const b = await runHypothesis(c, { hypothesisId: "r1", R: 20 });
	const na = a.nulls ?? new Float64Array(0);
	const nb = b.nulls ?? new Float64Array(0);
	const same = na.length === 20 && na.every((v, i) => v === nb[i]);
	const msg = `r1 R=20 twice: nulls ${same ? "identical" : "DIFFER"} (mean ${a.nullMean?.toFixed(1)}), seed ${DEFAULT_SEED}`;
	if (same) ok(msg);
	else fail(msg);
}

/* ─────────── 3. replication ─────────── */

console.log("\nreplication");
interface Row {
	id: string;
	observed: number;
	recorded: string;
	nullMean: number | null;
	p: number | null;
	verdict: string;
	note: string;
	ms: number;
	R: number;
}
const rows: Row[] = [];
const fmt = (x: number | null, d = 3) =>
	x == null
		? "—"
		: Math.abs(x) >= 100
			? Math.round(x).toLocaleString("en")
			: Number(x.toPrecision(d)).toString();
const fmtP = (p: number | null, R: number) =>
	p == null
		? "—"
		: R > 0 && p <= 1 / (R + 1) + 1e-12
			? `<${fmt(1 / (R + 1), 2)}`
			: fmt(p, 2);

/**
 * Live verdicts that disagree with the ledger and were reviewed at
 * integration (2026-09-24). They are findings about the claims, not engine
 * faults: the UI shows them as they are; here they do not fail the run.
 */
// No known findings today. chain:KH0507>KH0513 used to sit here: its
// "contradicts" came from a heads-only (order-only) null, not the data; the
// chain null is now arith_chain.py's (both khipus shuffled). The screen pairs
// (pair:KH0468|KH0691 and the other link_screens.py pairs) carry no
// expectation: a single-pair shuffle cannot see the screen's multiplicity.
const KNOWN: Record<string, { verdicts: string[]; why: string }> = {};

const results: Record<string, RunResult> = {};
for (const h of HYPOTHESES) {
	if (!h.expected) continue;
	if (only && !only.has(h.id)) continue;
	if (quick && h.id === "profileCounts") continue;
	const R = h.R > 0 ? (quick ? Math.max(20, Math.round(h.R / 5)) : h.R) : 0;
	let r: RunResult;
	try {
		r = await runHypothesis(c, { hypothesisId: h.id, R });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		rows.push({
			id: h.id,
			observed: Number.NaN,
			recorded: "",
			nullMean: null,
			p: null,
			verdict: "error",
			note: msg,
			ms: 0,
			R,
		});
		fail(`${h.id}: ${msg}`);
		continue;
	}
	results[h.id] = r;
	const v = judge(h, r);
	const e = h.expected;
	const rec = [
		e.value != null ? fmt(e.value) : null,
		e.nullMean != null ? `null ${fmt(e.nullMean)}` : null,
		e.direction,
	]
		.filter(Boolean)
		.join(" · ");
	rows.push({
		id: h.id,
		observed: r.observed,
		recorded: rec,
		nullMean: r.nullMean,
		p: r.p,
		verdict: v.verdict,
		note: v.note,
		ms: r.provenance.ms,
		R,
	});
	const bad = v.verdict === "drift" || v.verdict === "contradicts";
	const known = KNOWN[h.id]?.verdicts.includes(v.verdict) ?? false;
	if (bad && (strict || !known)) failures++;
}

const header = [
	"id",
	"observed",
	"recorded",
	"null mean",
	"p",
	"verdict",
	"ms",
];
const table = rows.map((r) => [
	r.id,
	fmt(r.observed, 4),
	r.recorded,
	fmt(r.nullMean),
	fmtP(r.p, r.R),
	r.verdict,
	String(r.ms),
]);
const width = header.map((h, i) =>
	Math.max(h.length, ...table.map((t) => t[i].length)),
);
const line = (cells: string[]) =>
	`| ${cells.map((s, i) => s.padEnd(width[i])).join(" | ")} |`;
console.log(line(header));
console.log(`|${width.map((w) => "-".repeat(w + 2)).join("|")}|`);
for (const t of table) console.log(line(t));
console.log("");
for (const r of rows)
	if (r.verdict !== "reproduces") {
		const k = KNOWN[r.id]?.verdicts.includes(r.verdict) ? KNOWN[r.id] : null;
		console.log(
			`  ${r.id}: ${r.verdict} — ${r.note}${k ? `\n      known finding: ${k.why}` : ""}`,
		);
	}

if (jsonOut) {
	writeFileSync(
		jsonOut,
		JSON.stringify(
			{
				dataHash: c.dataHash,
				quick,
				rows,
				results: Object.fromEntries(
					Object.entries(results).map(([id, r]) => [
						id,
						{ ...r, nulls: r.nulls ? Array.from(r.nulls) : null },
					]),
				),
			},
			null,
			1,
		),
	);
	console.log(`wrote ${jsonOut}`);
}

console.log(
	`\n${failures === 0 ? "ALL OK" : `${failures} failure(s)`} in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
);
process.exit(failures === 0 ? 0 : 1);
