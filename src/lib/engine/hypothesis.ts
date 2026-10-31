/**
 * Run and judge logic for the /next engine: spec handling, the seed schedule,
 * result assembly, the single-thread reference runner and the verdict rule.
 * Node-importable.
 *
 * Determinism contract: replicate r of a run always draws from
 * mulberry32(replicateSeed(h, spec, seed, r)) and unit u from
 * unitSeed(h, spec, seed, u). Executors take randomness only from the rng or
 * seed they are handed, so this runner and the worker pool (which shards the
 * same schedule and assembles through `assemble`) give identical nulls.
 */
import type {
	CorpusLite,
	Hypothesis,
	Observation,
	RunRequest,
	RunResult,
	Spec,
	SpecValue,
	UnitResult,
	VerdictRecord,
} from "../next/types.ts";
import { corpusFor } from "./corpus.ts";
import {
	claimChangingAxes,
	getExecutor,
	getHypothesis,
	unjudgedWhy,
} from "./registry.ts";
import { mulberry32, seedFor } from "./rng.ts";
import { lowerP, mean, normalUpper, sd, upperP, zScore } from "./stats.ts";

export const ENGINE_VERSION = "next-2";
export const DEFAULT_SEED = 20260924;

/** keys a spec may carry for `h`: its default spec plus its axes */
function specKeys(h: Hypothesis): Set<string> {
	const s = new Set(Object.keys(h.defaultSpec));
	for (const a of h.axes) s.add(a.key);
	return s;
}

/** `partial` merged over the default spec; keys `h` does not know are dropped */
export function fullSpec(h: Hypothesis, partial?: Spec): Spec {
	const out: Spec = { ...h.defaultSpec };
	if (!partial) return out;
	const keys = specKeys(h);
	for (const [k, v] of Object.entries(partial)) {
		if (keys.has(k) && v !== undefined) out[k] = v;
	}
	return out;
}

/** keys sorted, "k=v" joined by ";" */
export function specKey(spec: Spec): string {
	return Object.keys(spec)
		.sort()
		.map((k) => `${k}=${String(spec[k])}`)
		.join(";");
}

function coerce(raw: string, like: SpecValue | undefined): SpecValue | null {
	if (typeof like === "number") {
		const n = Number(raw);
		return raw.trim() !== "" && Number.isFinite(n) ? n : null;
	}
	if (typeof like === "boolean") {
		if (raw === "true") return true;
		if (raw === "false") return false;
		return null;
	}
	return raw;
}

/**
 * Parse a spec key back into a full spec. Unknown keys are dropped; a value
 * takes the type of the matching axis option, else the type of the default.
 */
export function parseSpecKey(key: string, h: Hypothesis): Spec {
	const partial: Spec = {};
	const keys = specKeys(h);
	for (const part of key.split(";")) {
		if (!part) continue;
		const eq = part.indexOf("=");
		if (eq <= 0) continue;
		const k = part.slice(0, eq);
		const raw = part.slice(eq + 1);
		if (!keys.has(k)) continue;
		const axis = h.axes.find((a) => a.key === k);
		const opt = axis?.options.find((o) => String(o.value) === raw);
		if (opt) {
			partial[k] = opt.value;
			continue;
		}
		const like = h.defaultSpec[k] ?? axis?.options[0]?.value;
		const v = coerce(raw, like);
		if (v !== null) partial[k] = v;
	}
	return fullSpec(h, partial);
}

export function isDefaultSpec(h: Hypothesis, spec: Spec): boolean {
	return specKey(fullSpec(h, spec)) === specKey(fullSpec(h));
}

/**
 * Does `spec` keep the claim? False when an axis that changes what is tested
 * (registry `claimChangingAxes`: a total's position, a top cord's target…)
 * is off its default: such a specification is a control, not a robustness
 * check.
 */
export function keepsClaim(h: Hypothesis, spec: Spec): boolean {
	const full = fullSpec(h, spec);
	return claimChangingAxes(h).every((k) => full[k] === h.defaultSpec[k]);
}

/**
 * Does one specification of a spec curve hold the claim? For a claim that
 * must beat chance ("above", and anything with no direction): BH q < .05 with
 * the default's sign (positive for "above"). For a claim that must stay at
 * chance: q >= .05, or within the recorded ratio of the chance level. The
 * spec curve's "holds in N of M" and the ledger's Robust share both use this.
 */
export function specHolds(
	h: Hypothesis,
	pt: {
		q: number | null;
		z: number | null;
		observed: number;
		nullMean: number | null;
	},
	defaultZ: number | null,
): boolean {
	if (pt.q == null) return false;
	const e = h.expected;
	if (e?.direction === "chance") {
		const ratioOk =
			e.ratioMax != null &&
			pt.nullMean != null &&
			pt.nullMean > 0 &&
			pt.observed / pt.nullMean <= e.ratioMax;
		return pt.q >= 0.05 || ratioOk;
	}
	const sign = e?.direction === "above" ? 1 : Math.sign(defaultZ ?? 0);
	return pt.q < 0.05 && (sign === 0 || Math.sign(pt.z ?? 0) === sign);
}

/** cartesian product of the axes over the default spec, default first, at most `cap` points */
export function specGrid(h: Hypothesis, cap = 48): Spec[] {
	const base = fullSpec(h);
	const out: Spec[] = [base];
	const seen = new Set([specKey(base)]);
	let combos: Spec[] = [{}];
	for (const a of h.axes) {
		const next: Spec[] = [];
		for (const c of combos)
			for (const o of a.options) next.push({ ...c, [a.key]: o.value });
		combos = next;
		if (combos.length > 4096) break;
	}
	for (const c of combos) {
		if (out.length >= cap) break;
		const s = fullSpec(h, c);
		const k = specKey(s);
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(s);
	}
	return out;
}

/** seed of null replicate r: seedFor(h.id, specKey, seed, r) over the full spec */
export function replicateSeed(
	h: Hypothesis,
	spec: Spec,
	seed: number,
	r: number,
): number {
	return seedFor(h.id, specKey(fullSpec(h, spec)), seed, r);
}

/** seed of unit u: seedFor(h.id, specKey, seed, "unit", u) */
export function unitSeed(
	h: Hypothesis,
	spec: Spec,
	seed: number,
	unit: string,
): number {
	return seedFor(h.id, specKey(fullSpec(h, spec)), seed, "unit", unit);
}

/** Build the RunResult from the pieces; shared by this runner and pool.ts. */
export function assemble(
	h: Hypothesis,
	spec: Spec,
	seed: number,
	R: number,
	obs: Observation,
	nulls: Float64Array | null,
	analytic: { mean: number; sd: number } | null,
	units: UnitResult[] | null,
	dataHash: string,
	ms: number,
	workers: number,
): RunResult {
	const full = fullSpec(h, spec);
	const observed = obs.value;
	let nullMean: number | null = null;
	let nullSd: number | null = null;
	let p: number | null = null;
	let pLower: number | null = null;
	let z: number | null = null;
	if (nulls && nulls.length > 0) {
		nullMean = mean(nulls);
		nullSd = sd(nulls);
		p = upperP(observed, nulls);
		pLower = lowerP(observed, nulls);
		z = zScore(observed, nullMean, nullSd);
	} else if (analytic) {
		nullMean = analytic.mean;
		nullSd = analytic.sd;
		z = zScore(observed, analytic.mean, analytic.sd);
		p = normalUpper(z);
		pLower = normalUpper(-z);
	}
	const out: RunResult = {
		observed,
		obs,
		nulls: nulls && nulls.length > 0 ? nulls : null,
		nullMean,
		nullSd,
		p,
		pLower,
		z,
		provenance: {
			hypothesisId: h.id,
			claimId: h.claimId,
			spec: full,
			specKey: specKey(full),
			seed,
			R,
			dataHash,
			engine: ENGINE_VERSION,
			ms,
			at: new Date().toISOString(),
			workers,
		},
	};
	if (units) out.units = units;
	return out;
}

function abortError(): Error {
	const e = new Error("The run was cancelled");
	e.name = "AbortError";
	return e;
}

const YIELD_MS = 50;
const now = () =>
	typeof performance !== "undefined" ? performance.now() : Date.now();
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Single-thread reference run (Node, tests, and the pool's no-Worker
 * fallback). Yields to the event loop about every 50 ms.
 */
export async function runHypothesis(
	c: CorpusLite,
	req: RunRequest,
	opts: {
		signal?: AbortSignal;
		onProgress?: (done: number, total: number) => void;
	} = {},
): Promise<RunResult> {
	const h = getHypothesis(req.hypothesisId);
	if (!h) throw new Error(`unknown hypothesis ${req.hypothesisId}`);
	const ex = getExecutor(req.hypothesisId);
	const spec = fullSpec(h, req.spec);
	const cc = corpusFor(c, spec.valueSource === "knots" ? "knots" : "kfg");
	const seed = req.seed ?? DEFAULT_SEED;
	const R = Math.max(0, Math.floor(req.R ?? h.R));
	const { signal, onProgress } = opts;
	const t0 = now();
	let last = t0;
	const pace = async (done: number, total: number) => {
		const t = now();
		if (t - last < YIELD_MS) return;
		last = t;
		onProgress?.(done, total);
		await tick();
		if (signal?.aborted) throw abortError();
	};
	if (signal?.aborted) throw abortError();

	let obs: Observation;
	let nulls: Float64Array | null = null;
	let analytic: { mean: number; sd: number } | null = null;
	let units: UnitResult[] | null = null;

	if (ex.nullKind === "replicate" && ex.replicate && R > 0) {
		obs = ex.observe(cc, spec);
		nulls = new Float64Array(R);
		for (let r = 0; r < R; r++) {
			nulls[r] = ex.replicate(
				cc,
				spec,
				mulberry32(replicateSeed(h, spec, seed, r)),
			);
			await pace(r + 1, R);
		}
		onProgress?.(R, R);
	} else if (ex.nullKind === "analytic" && ex.analytic) {
		obs = ex.observe(cc, spec);
		analytic = ex.analytic(cc, spec);
		onProgress?.(1, 1);
	} else if (ex.nullKind === "units" && ex.units && ex.runUnit) {
		const list = ex.units(cc, spec);
		units = [];
		for (let i = 0; i < list.length; i++) {
			const u = list[i];
			units.push(ex.runUnit(cc, spec, u, unitSeed(h, spec, seed, u)));
			await pace(i + 1, list.length);
		}
		onProgress?.(list.length, list.length);
		obs = ex.combine ? ex.combine(units, spec) : ex.observe(cc, spec);
	} else {
		obs = ex.observe(cc, spec);
		onProgress?.(1, 1);
	}
	if (signal?.aborted) throw abortError();
	return assemble(
		h,
		spec,
		seed,
		R,
		obs,
		nulls,
		analytic,
		units,
		cc.dataHash,
		Math.round(now() - t0),
		0,
	);
}

function fmt(x: number): string {
	if (!Number.isFinite(x)) return String(x);
	const r = Math.abs(x) >= 100 ? Math.round(x) : Number(x.toPrecision(3));
	return r.toLocaleString("en");
}

/** p with 2 significant figures, or "< 1/(R+1)" at the replicate floor (spec §6) */
function fmtP(p: number, r: RunResult): string {
	const R = r.nulls ? r.provenance.R : 0;
	if (R > 0 && p <= 1 / (R + 1) + 1e-12)
		return `< ${Number((1 / (R + 1)).toPrecision(2))}`;
	if (p > 0 && p < 1e-4) return p.toExponential(1);
	return Number(p.toPrecision(2)).toString();
}

/**
 * The verdict rule (spec §4.4). Only a default-spec run is judged; anything
 * else is exploratory.
 */
export function judge(h: Hypothesis, r: RunResult): VerdictRecord {
	const rec = (verdict: VerdictRecord["verdict"], note: string) => ({
		hypothesisId: h.id,
		verdict,
		observed: r.observed,
		p: r.p,
		z: r.z,
		note,
		dataHash: r.provenance.dataHash,
		at: new Date().toISOString(),
	});
	if (!isDefaultSpec(h, r.provenance.spec))
		return rec("exploratory", "not the default specification");
	const e = h.expected;
	if (!e)
		return rec(
			"exploratory",
			unjudgedWhy(h) ?? "no recorded number to compare with",
		);

	const valueOk =
		e.value == null || Math.abs(r.observed - e.value) <= (e.tol ?? 0);
	if (!valueOk)
		return rec(
			"drift",
			`observed ${fmt(r.observed)}, recorded ${fmt(e.value as number)}`,
		);
	if (e.detail) {
		for (const [k, want] of Object.entries(e.detail)) {
			const got = r.obs.detail?.[k];
			if (got == null || Math.abs(got - want.value) > want.tol)
				return rec(
					"drift",
					`${k}: observed ${got == null ? "none" : fmt(got)}, recorded ${fmt(want.value)}`,
				);
		}
	}
	if (e.nullMean != null && r.nullMean != null) {
		if (Math.abs(r.nullMean - e.nullMean) > (e.nullTol ?? 0))
			return rec(
				"drift",
				`chance level moved: ${fmt(r.nullMean)} against recorded ${fmt(e.nullMean)}`,
			);
	}

	if (e.direction === "count")
		return rec(
			"reproduces",
			e.value == null
				? "every recorded count matches"
				: `observed ${fmt(r.observed)} matches the recorded ${fmt(e.value)}`,
		);

	const p = r.p;
	if (p == null) return rec("exploratory", "no chance level was computed");
	const vs = r.nullMean == null ? "" : ` against ${fmt(r.nullMean)} by chance`;
	if (e.direction === "above") {
		if (p < 0.01)
			return rec("reproduces", `${fmt(r.observed)}${vs}, p ${fmtP(p, r)}`);
		if (p < 0.05)
			return rec(
				"weak",
				`${fmt(r.observed)}${vs}, p ${fmtP(p, r)} (not below 0.01)`,
			);
		return rec(
			"contradicts",
			`${fmt(r.observed)}${vs}, p ${fmtP(p, r)}: not beyond chance`,
		);
	}
	// chance
	const ratioOk =
		e.ratioMax != null &&
		r.nullMean != null &&
		r.nullMean > 0 &&
		r.observed / r.nullMean <= e.ratioMax;
	if (p >= 0.05 || ratioOk)
		return rec(
			"reproduces",
			ratioOk && p < 0.05
				? `${fmt(r.observed)}${vs}: within ${fmt(e.ratioMax as number)}× of chance`
				: `${fmt(r.observed)}${vs}, p ${fmtP(p, r)}: at chance`,
		);
	if (p < 0.01)
		return rec(
			"contradicts",
			`${fmt(r.observed)}${vs}, p ${fmtP(p, r)}: beyond chance, recorded as chance`,
		);
	return rec("weak", `${fmt(r.observed)}${vs}, p ${fmtP(p, r)}: borderline`);
}
