/**
 * The Proving Ground notebook: every run, lineup trial and verdict this
 * browser has produced, plus the alpha-investing wealth that exploratory runs
 * spend. Stored in localStorage; every access is wrapped because storage can
 * be blocked, full or absent, in which case the notebook lives in memory for
 * the session and the page still works.
 */
import { useSyncExternalStore } from "react";
import { alphaInvest, alphaStart } from "../engine/stats.ts";
import type {
	AlphaWealth,
	LineupTrial,
	PreregCard,
	Provenance,
	RunResult,
	SealedCard,
	VerdictRecord,
} from "./types.ts";

export interface RunLogEntry {
	key: string;
	label: string;
	kind: "run" | "spec" | "replicate" | "batch";
	provenance: Provenance;
	observed: number;
	p: number | null;
	z: number | null;
	nullMean: number | null;
	/** additive to the §4.5 contract: 16-bin histogram of the nulls, for the sparkline */
	spark?: number[];
	/** additive: whether the run counted as exploratory (and so spent alpha) */
	exploratory?: boolean;
	/** additive: the alpha-investing bid for an exploratory run, and whether it rejected */
	bid?: number;
	reject?: boolean;
}

const K_RUNS = "pg:runs:v1";
const K_TRIALS = "pg:trials:v1";
const K_WEALTH = "pg:wealth:v1";
// v2 (2026-09-24): chain and top-cord nulls changed, chance-claim robustness fixed
const K_VERDICTS = "pg:verdicts:v2:";
const K_SPECS = "pg:specsum:v2:";
const MAX_RUNS = 600;
const MAX_TRIALS = 500;
const SPARK_BINS = 16;

/* ─────────── storage with a memory fallback ─────────── */

const memory = new Map<string, string>();

function readKey(key: string): string | null {
	try {
		const v = globalThis.localStorage?.getItem(key);
		if (v != null) return v;
	} catch {
		/* storage blocked: fall through to memory */
	}
	return memory.get(key) ?? null;
}

function writeKey(key: string, value: string | null): void {
	if (value == null) memory.delete(key);
	else memory.set(key, value);
	try {
		const ls = globalThis.localStorage;
		if (!ls) return;
		if (value == null) ls.removeItem(key);
		else ls.setItem(key, value);
	} catch {
		/* quota or blocked: the memory copy stands in */
	}
}

function readJsonKey<T>(key: string, fallback: T): T {
	const s = readKey(key);
	if (s == null) return fallback;
	try {
		return JSON.parse(s) as T;
	} catch {
		return fallback;
	}
}

function writeJsonKey(key: string, value: unknown): void {
	try {
		writeKey(key, JSON.stringify(value));
	} catch {
		/* unserialisable: ignore */
	}
}

/* ─────────── the store ─────────── */

interface NotebookState {
	runs: RunLogEntry[];
	trials: LineupTrial[];
	wealth: AlphaWealth;
}

function isWealth(w: unknown): w is AlphaWealth {
	const o = w as AlphaWealth | null;
	return (
		!!o &&
		typeof o.wealth === "number" &&
		typeof o.tests === "number" &&
		typeof o.rejections === "number" &&
		typeof o.spent === "number"
	);
}

let state: NotebookState | null = null;
const listeners = new Set<() => void>();

function current(): NotebookState {
	if (!state) {
		const runs = readJsonKey<unknown>(K_RUNS, []);
		const trials = readJsonKey<unknown>(K_TRIALS, []);
		const wealth = readJsonKey<unknown>(K_WEALTH, null);
		state = {
			runs: Array.isArray(runs) ? (runs as RunLogEntry[]) : [],
			trials: Array.isArray(trials) ? (trials as LineupTrial[]) : [],
			wealth: isWealth(wealth) ? wealth : alphaStart(),
		};
	}
	return state;
}

function commit(next: NotebookState): void {
	state = next;
	snapshot = null;
	writeJsonKey(K_RUNS, next.runs);
	writeJsonKey(K_TRIALS, next.trials);
	writeJsonKey(K_WEALTH, next.wealth);
	for (const fn of listeners) fn();
}

function sparkOf(nulls: Float64Array | null): number[] | undefined {
	if (!nulls || nulls.length === 0) return undefined;
	let lo = Number.POSITIVE_INFINITY;
	let hi = Number.NEGATIVE_INFINITY;
	for (let i = 0; i < nulls.length; i++) {
		const v = nulls[i];
		if (v < lo) lo = v;
		if (v > hi) hi = v;
	}
	const bins = new Array<number>(SPARK_BINS).fill(0);
	const w = hi - lo || 1;
	for (let i = 0; i < nulls.length; i++) {
		const b = Math.min(
			SPARK_BINS - 1,
			Math.floor(((nulls[i] - lo) / w) * SPARK_BINS),
		);
		bins[b]++;
	}
	return bins;
}

/** Key shared with the engine's result cache: hypothesisId|specKey|R|seed|dataHash. */
export function runKey(p: Provenance): string {
	return `${p.hypothesisId}|${p.specKey}|${p.R}|${p.seed}|${p.dataHash}`;
}

export function logRun(
	r: RunResult,
	label: string,
	kind: RunLogEntry["kind"],
	exploratory: boolean,
): void {
	const s = current();
	const entry: RunLogEntry = {
		key: runKey(r.provenance),
		label,
		kind,
		provenance: r.provenance,
		observed: r.observed,
		p: r.p,
		z: r.z,
		nullMean: r.nullMean,
		spark: sparkOf(r.nulls),
		exploratory,
	};
	let wealth = s.wealth;
	if (exploratory && r.p != null && Number.isFinite(r.p)) {
		const step = alphaInvest(wealth, r.p);
		wealth = step.state;
		entry.bid = step.bid;
		entry.reject = step.reject;
	}
	const runs = [entry, ...s.runs].slice(0, MAX_RUNS);
	commit({ ...s, runs, wealth });
}

/** The bid the next exploratory run would place, for "exploratory run: α bid 0.012". */
export function nextBid(): number {
	const w = current().wealth.wealth;
	return w / 2 / (1 + w / 2);
}

export function logTrial(t: LineupTrial): void {
	const s = current();
	commit({ ...s, trials: [t, ...s.trials].slice(0, MAX_TRIALS) });
}

export function saveVerdicts(
	dataHash: string,
	v: Record<string, VerdictRecord>,
): void {
	writeJsonKey(K_VERDICTS + dataHash, v);
}

export function loadVerdicts(dataHash: string): Record<string, VerdictRecord> {
	const v = readJsonKey<unknown>(K_VERDICTS + dataHash, {});
	return v && typeof v === "object" && !Array.isArray(v)
		? (v as Record<string, VerdictRecord>)
		: {};
}

/** additive to §4.5: spec-curve summaries persist beside the verdicts */
export function saveSpecSummaries(
	dataHash: string,
	v: Record<string, { robustShare: number; n: number }>,
): void {
	writeJsonKey(K_SPECS + dataHash, v);
}

export function loadSpecSummaries(
	dataHash: string,
): Record<string, { robustShare: number; n: number }> {
	const v = readJsonKey<unknown>(K_SPECS + dataHash, {});
	return v && typeof v === "object" && !Array.isArray(v)
		? (v as Record<string, { robustShare: number; n: number }>)
		: {};
}

function variantKey(e: RunLogEntry): string {
	const p = e.provenance;
	return `${p.specKey}|${p.R}|${p.seed}`;
}

/** Distinct exploratory variants (spec, R, seed) run for one hypothesis. */
function variantsTried(hypothesisId: string): number {
	const seen = new Set<string>();
	for (const e of current().runs)
		if (e.exploratory && e.provenance.hypothesisId === hypothesisId)
			seen.add(variantKey(e));
	return seen.size;
}

/** Distinct exploratory variants over every hypothesis. */
export function variantsTotal(): number {
	const seen = new Set<string>();
	for (const e of current().runs)
		if (e.exploratory)
			seen.add(`${e.provenance.hypothesisId}|${variantKey(e)}`);
	return seen.size;
}

function clear(): void {
	commit({ runs: [], trials: [], wealth: alphaStart() });
}

function exportBundle(): Blob {
	const s = current();
	const verdicts: Record<string, unknown> = {};
	const specs: Record<string, unknown> = {};
	const hashes = new Set(s.runs.map((r) => r.provenance.dataHash));
	for (const h of hashes) {
		verdicts[h] = loadVerdicts(h);
		specs[h] = loadSpecSummaries(h);
	}
	const bundle = {
		kind: "khipu-proving-ground-notebook",
		version: 1,
		exported: new Date().toISOString(),
		wealth: s.wealth,
		runs: s.runs,
		trials: s.trials,
		verdicts,
		specSummaries: specs,
	};
	return new Blob([JSON.stringify(bundle, null, 1)], {
		type: "application/json",
	});
}

export interface Notebook {
	runs: RunLogEntry[];
	trials: LineupTrial[];
	wealth: AlphaWealth;
	variantsTried(hypothesisId: string): number;
	clear(): void;
	exportBundle(): Blob;
}

let snapshot: Notebook | null = null;

function getSnapshot(): Notebook {
	if (!snapshot) {
		const s = current();
		snapshot = {
			runs: s.runs,
			trials: s.trials,
			wealth: s.wealth,
			variantsTried,
			clear,
			exportBundle,
		};
	}
	return snapshot;
}

function subscribe(fn: () => void): () => void {
	listeners.add(fn);
	return () => {
		listeners.delete(fn);
	};
}

export function useNotebook(): Notebook {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/* ─────────── sealing ─────────── */

function canonical(v: unknown): unknown {
	if (Array.isArray(v)) return v.map(canonical);
	if (v && typeof v === "object") {
		const o = v as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const k of Object.keys(o).sort())
			if (o[k] !== undefined) out[k] = canonical(o[k]);
		return out;
	}
	return v;
}

/** canonical JSON: keys sorted at every depth, no whitespace */
export function canonicalJson(v: unknown): string {
	return JSON.stringify(canonical(v));
}

export async function seal(card: PreregCard): Promise<SealedCard> {
	const subtle = globalThis.crypto?.subtle;
	if (!subtle)
		throw new Error("This browser offers no SHA-256 here (needs https).");
	const bytes = new TextEncoder().encode(canonicalJson(card));
	const digest = await subtle.digest("SHA-256", bytes);
	const hex = Array.from(new Uint8Array(digest), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
	return { ...card, sha256: hex };
}
