/**
 * URL schema for /next/proving-ground. Every piece of page state lives in the
 * search string so any view can be cited; `validatePGSearch` is the route's
 * `validateSearch` and silently drops anything malformed.
 */
import type { ClaimKind, ClaimStatus } from "./types.ts";

export type PGView = "claims" | "links";
export type PGTab = "null" | "spec" | "evidence" | "lineup" | "provenance";

export interface PGSearch {
	view?: PGView;
	claim?: string;
	tab?: PGTab;
	spec?: string;
	R?: number;
	seed?: number;
	thread?: number;
	/** the pair shown on the Evidence tab of a claim that covers several */
	pair?: string;
	sel?: string;
	blind?: true;
	q?: string;
	kind?: ClaimKind;
	filter?: "live" | "drift" | "controls" | "open-work";
	status?: ClaimStatus;
}

const VIEWS: readonly PGView[] = ["claims", "links"];
const TABS: readonly PGTab[] = [
	"null",
	"spec",
	"evidence",
	"lineup",
	"provenance",
];
const KINDS: readonly ClaimKind[] = [
	"link",
	"reading",
	"grammar",
	"null-result",
	"data-correction",
	"method",
];
const FILTERS: readonly NonNullable<PGSearch["filter"]>[] = [
	"live",
	"drift",
	"controls",
	"open-work",
];
const STATUSES: readonly ClaimStatus[] = [
	"held",
	"fell",
	"likely",
	"open",
	"published-prior",
];

/** Largest replicate count the URL may ask for (keeps a pasted link sane). */
const R_MAX = 20000;
const STR_MAX = 400;

function oneOf<T extends string>(
	v: unknown,
	list: readonly T[],
): T | undefined {
	return typeof v === "string" && (list as readonly string[]).includes(v)
		? (v as T)
		: undefined;
}

function str(v: unknown): string | undefined {
	if (typeof v === "number" && Number.isFinite(v)) return String(v);
	if (typeof v !== "string") return undefined;
	const s = v.trim();
	return s && s.length <= STR_MAX ? s : undefined;
}

function int(v: unknown, min: number, max: number): number | undefined {
	const n =
		typeof v === "number"
			? v
			: typeof v === "string" && /^-?\d+$/.test(v.trim())
				? Number(v)
				: Number.NaN;
	return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

export function validatePGSearch(raw: Record<string, unknown>): PGSearch {
	const out: PGSearch = {};
	const view = oneOf(raw.view, VIEWS);
	if (view) out.view = view;
	const claim = str(raw.claim);
	if (claim) out.claim = claim;
	const tab = oneOf(raw.tab, TABS);
	if (tab) out.tab = tab;
	const spec = str(raw.spec);
	if (spec) out.spec = spec;
	const R = int(raw.R, 0, R_MAX);
	if (R !== undefined) out.R = R;
	const seed = int(raw.seed, 0, 0xffffffff);
	if (seed !== undefined) out.seed = seed;
	const thread = int(raw.thread, 0, 1_000_000);
	if (thread !== undefined) out.thread = thread;
	const pair = str(raw.pair);
	if (pair && /^KH\d{4}\|KH\d{4}$/.test(pair)) out.pair = pair;
	const sel = str(raw.sel);
	if (sel) out.sel = sel;
	if (raw.blind === true || raw.blind === "true" || raw.blind === 1)
		out.blind = true;
	const q = str(raw.q);
	if (q) out.q = q;
	const kind = oneOf(raw.kind, KINDS);
	if (kind) out.kind = kind;
	const filter = oneOf(raw.filter, FILTERS);
	if (filter) out.filter = filter;
	const status = oneOf(raw.status, STATUSES);
	if (status) out.status = status;
	return out;
}
