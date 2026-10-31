/**
 * Shared contract for /next/proving-ground. Node-importable: type-only imports,
 * no import.meta. Owned by P1; frozen for the build session.
 */
import type { StrandFile } from "../stories/strands.ts";

/* ─────────── corpus-lite.json (scripts/next/build_corpus.py) ─────────── */

export interface CorpusLiteFile {
	version: 1;
	generated: string; // ISO timestamp
	script: string; // "scripts/next/build_corpus.py"
	dataHash: string; // sha256 hex over public/data/khipus/*.json bytes, files in id order
	colours: string[]; // interned longest-colour keys
	places: string[]; // interned KhipuSummary.provenance
	museums: string[]; // interned KhipuSummary.museum
	khipus: KhipuLiteRaw[]; // sorted by id
}

export interface KhipuLiteRaw {
	id: string;
	/** level-1 cords by ordinal, top cords included: value ?? 0, unrounded */
	seq: number[];
	/** one char per level-1 cord: "P" pendant, "T" top, "M" anything else */
	kind: string;
	/** cord.group ?? -1 per level-1 cord */
	grp: number[];
	/** index into colours (longest colorParsed segment), -1 none */
	col: number[];
	/** one char per level-1 cord: "K" intact, "B" broken, "?" unknown */
	term: string;
	/** [level-1 index, trunc values of its direct subsidiaries in file order] (markers excluded); only cords that have any */
	subs: [number, number[]][];
	/** [level-1 index, knot-derived value] for cords carrying valueConflict */
	kv: [number, number][];
	/** cords at any level carrying valueConflict (kv holds only the level-1 ones) */
	nConflicts: number;
	flags: number; // FLAG bitmask
	place: number; // index into places, -1 unknown
	museum: number; // index into museums, -1 unknown
	age: [number, number] | null; // earliestAge, latestAge
}

export const FLAG = {
	NOT_DECIMAL: 1, // Wari + declared unreadable (compute-audit §3 list)
	WARI: 2,
	CORD_DATA_ERROR: 4,
	VALUE_CONFLICT: 8, // at least one cord with valueConflict
	INKAWASI: 16, // provenance matches /incahuasi|inkawasi/i
	IN_OKR: 32,
} as const;

/* ─────────── in-memory corpus (engine/corpus.ts parseCorpus) ─────────── */

export type Cluster =
	| { k: "P"; start: number; size: number } // pendant group: slots [start, start+size) of pv
	| { k: "T"; values: number[] }; // a group with no pendants (lone top cords), trunc values

export interface KhipuLite {
	id: string;
	index: number; // position in CorpusLite.khipus
	seq: Float64Array;
	kind: Uint8Array; // 0 P, 1 T, 2 M
	grp: Int16Array;
	col: Int32Array;
	term: Uint8Array; // 0 K, 1 B, 2 ?
	subs: Map<number, number[]>; // level-1 index -> subsidiary values
	kv: Map<number, number>; // level-1 index -> knot-derived value
	nConflicts: number; // value/knot conflict cords at any level
	/** MK / profile model: pendants only (kind P), group order then ordinal, Math.trunc(value ?? 0) */
	pv: Int32Array;
	pL1: Int32Array; // level-1 index of each pendant slot
	pCol: Int32Array; // colour per pendant slot
	pSubs: number[][]; // subsidiary values per pendant slot ([] if none)
	sizes: number[]; // pendant count per group that has pendants, group order
	clusters: Cluster[]; // primary order
	flags: number;
	place: number;
	museum: number;
	age: [number, number] | null;
}

export interface CorpusLite {
	dataHash: string;
	generated: string;
	khipus: KhipuLite[];
	byId: Map<string, KhipuLite>;
	colours: string[];
	places: string[];
	museums: string[];
	/** corpus count of each nonzero level-1 value (for information content) */
	valueFreq: Map<number, number>;
	valueTotal: number;
	/** attached by loaders when available; needed by strandsVerified */
	strands?: StrandFile;
}

export type ValueSource = "kfg" | "knots";

/* ─────────── engine ─────────── */

export type Rng = () => number;

export type NullModel =
	| "sequence" // permute seq (level-1 incl. top cords) — passage / pair nulls
	| "seqWithin" // permute seq within each grp value
	| "values" // permute pv only among pendant slots (profile null)
	| "pendants" // MK null a: permute whole pendants (pv+pCol+pSubs) across slots, sizes kept
	| "within" // MK null c: permute whole pendants within each group
	| "groupOrder"; // MK null b: permute P-cluster blocks among P positions, T clusters fixed

export type Scope = "khipu" | "pair" | "corpus";
export type SpecValue = string | number | boolean;
export type Spec = Record<string, SpecValue>;

export interface SpecAxis {
	key: string;
	label: string;
	options: { value: SpecValue; label: string }[];
}

export interface Hit {
	ids: string[]; // khipu ids involved (1 for within-khipu hits)
	at?: number[][]; // per id: level-1 indices involved
	value?: number; // e.g. hit count for that khipu, or matched value
	label?: string;
}

export interface Observation {
	value: number; // the test statistic
	hits: Hit[]; // corpus scope: one Hit per khipu with value = its hit count
	detail?: Record<string, number>;
	/** pair scope: exact runs in forward coords of (a, b) = [len, startA, startB] */
	spans?: [number, number, number][];
	dir?: "fwd" | "rev";
}

export interface UnitResult {
	unit: string; // usually a khipu id
	observed: number;
	p: number | null;
	label: string; // e.g. profile verdict "clear"
	detail?: Record<string, number>;
}

export interface Executor {
	scope: Scope;
	nullKind: "replicate" | "analytic" | "units" | "none";
	observe(c: CorpusLite, spec: Spec): Observation;
	/** one null replicate's statistic; must use only `rng` for randomness */
	replicate?(c: CorpusLite, spec: Spec, rng: Rng): number;
	analytic?(c: CorpusLite, spec: Spec): { mean: number; sd: number };
	units?(c: CorpusLite, spec: Spec): string[];
	runUnit?(c: CorpusLite, spec: Spec, unit: string, seed: number): UnitResult;
	combine?(results: UnitResult[], spec: Spec): Observation;
}

export interface Expected {
	value?: number; // recorded observed statistic
	tol?: number;
	nullMean?: number; // recorded chance level
	nullTol?: number;
	detail?: Record<string, { value: number; tol: number }>;
	/** above: must beat its null; chance: must not; count: no null, value check only */
	direction: "above" | "chance" | "count";
	ratioMax?: number; // "chance": ok while observed / nullMean <= ratioMax
	source: string; // where the recorded number comes from (script / story / paper)
}

export interface Hypothesis {
	id: string; // registry id, e.g. "firstCordTotals", "pair:KH0097|KH0586", "chain:KH0517>KH0502"
	claimId: string; // claims.json id, or "control:decoy" etc.
	label: string;
	scope: Scope;
	ids?: string[];
	statistic: string; // plain words, e.g. "groups whose total sits on their first cord"
	defaultSpec: Spec;
	axes: SpecAxis[];
	R: number; // default replicates
	expected?: Expected; // judged only at defaultSpec
	control?: "negative" | "positive";
	lineup?: boolean;
	python?: string; // equivalent script command
	cost: "instant" | "seconds" | "heavy"; // heavy: never auto-run in the UI
}

export interface RunRequest {
	hypothesisId: string;
	spec?: Spec; // merged over defaultSpec
	R?: number;
	seed?: number; // default 20260924
}

export interface Provenance {
	hypothesisId: string;
	claimId: string;
	spec: Spec; // full spec
	specKey: string;
	seed: number;
	R: number;
	dataHash: string;
	engine: string; // ENGINE_VERSION
	ms: number;
	at: string; // ISO
	workers: number; // 0 = main thread / Node
}

export interface RunResult {
	observed: number;
	obs: Observation;
	nulls: Float64Array | null; // replicate statistics (index = replicate number)
	nullMean: number | null;
	nullSd: number | null;
	p: number | null; // upper tail, (1 + #>=) / (1 + R); analytic: normal upper tail
	pLower: number | null;
	z: number | null;
	units?: UnitResult[];
	provenance: Provenance;
}

export type Verdict =
	| "reproduces"
	| "drift"
	| "weak"
	| "contradicts"
	| "exploratory"
	| "not-ported";

export interface VerdictRecord {
	hypothesisId: string;
	verdict: Verdict;
	observed: number;
	p: number | null;
	z: number | null;
	note: string; // one line: why this verdict
	dataHash: string;
	at: string;
}

export interface SpecPoint {
	spec: Spec;
	specKey: string;
	observed: number;
	nullMean: number | null;
	nullLo: number | null; // 2.5% quantile of nulls
	nullHi: number | null; // 97.5%
	z: number | null;
	p: number | null;
	q: number | null; // BH across the grid
	isDefault: boolean;
}

export interface AlphaWealth {
	wealth: number; // starts at 0.05
	tests: number;
	rejections: number;
	spent: number;
}

export interface LineupTrial {
	hypothesisId: string;
	pair: string;
	seed: number;
	picked: number;
	real: number;
	correct: boolean;
	at: string;
}

export interface PreregCard {
	statement: string;
	hypothesisId: string;
	spec: Spec;
	direction: "above" | "chance";
	threshold: number; // p threshold
	R: number;
	seed: number;
	dataHash: string;
	created: string;
}
export interface SealedCard extends PreregCard {
	sha256: string;
}

export interface EngineStatus {
	state: "idle" | "loading" | "ready" | "error";
	dataHash?: string;
	nKhipus?: number;
	workers: number;
	error?: string;
}

/* ─────────── worker protocol (pool.ts <-> engine.worker.ts) ─────────── */

export type WorkerRequest =
	| { id: number; op: "init" }
	| { id: number; op: "observe"; req: RunRequest }
	| { id: number; op: "replicates"; req: RunRequest; from: number; to: number }
	| { id: number; op: "analytic"; req: RunRequest }
	| { id: number; op: "units"; req: RunRequest; units: string[] };

export type WorkerResponse =
	| { id: number; type: "ready"; dataHash: string; nKhipus: number }
	| { id: number; type: "progress"; done: number; total: number }
	| { id: number; type: "observed"; obs: Observation }
	| { id: number; type: "replicates"; from: number; values: Float64Array }
	| { id: number; type: "analytic"; mean: number; sd: number }
	| { id: number; type: "units"; results: UnitResult[] }
	| { id: number; type: "error"; message: string };

/* ─────────── claims.json (scripts/next/build_ledger.py) ─────────── */

export type ClaimStatus =
	| "held"
	| "fell"
	| "likely"
	| "open"
	| "published-prior";
export type ClaimKind =
	| "link"
	| "reading"
	| "grammar"
	| "null-result"
	| "data-correction"
	| "method";
export type Repro =
	| "live"
	| "script"
	| "constant"
	| "manual"
	| "scratchpad"
	| "none";
export type Downgrade =
	| "data-error"
	| "multiplicity"
	| "confound"
	| "prior-art"
	| "hand-checked";
export type Origin =
	| "published"
	| "screen"
	| "deep"
	| "story"
	| "survey"
	| "audit";

export interface Claim {
	id: string;
	statement: string;
	khipus: string[];
	kind: ClaimKind;
	status: ClaimStatus;
	test: string | null;
	numbers: string | null;
	script: string | null;
	story: string | null;
	prior: string | null;
	confounds: string | null;
	repro: Repro;
	origin: Origin;
	downgrades: Downgrade[];
	hypothesisId?: string; // registry id (static table in build_ledger.py, §5 P1)
	pair?: string; // pairKey when a link claim names exactly two khipus
	supersededBy?: string;
	supersedes?: string;
	control?: "negative" | "positive";
}

export interface ClaimsFile {
	version: 1;
	generated: string;
	source: string; // "scripts/next/ledger_src.json"
	counts: Record<ClaimStatus, number>;
	claims: Claim[];
}
