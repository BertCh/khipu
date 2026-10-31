/**
 * React bindings for the engine (browser only). Small module-level stores
 * (results cache, in-flight runs, verdicts, spec-curve summaries) are read
 * through useSyncExternalStore or per-hook state. A run requested twice while
 * in flight is shared, a finished run is served from the cache and never
 * logged twice, and every fresh result is written to the notebook, spending
 * alpha when it is exploratory. Default-spec runs at the registry's R and seed
 * are judged into the verdict store, persisted per dataHash.
 */
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import {
	loadSpecSummaries,
	loadVerdicts,
	logRun,
	type RunLogEntry,
	runKey,
	saveSpecSummaries,
	saveVerdicts,
} from "#/lib/next/notebook";
import type {
	EngineStatus,
	Hypothesis,
	RunRequest,
	RunResult,
	Spec,
	SpecPoint,
	VerdictRecord,
} from "#/lib/next/types";
import {
	DEFAULT_SEED,
	fullSpec,
	isDefaultSpec,
	judge,
	keepsClaim,
	specGrid,
	specHolds,
	specKey,
} from "./hypothesis.ts";
import { getPool } from "./pool.ts";
import { getHypothesis, HYPOTHESES } from "./registry.ts";
import { bh, quantile } from "./stats.ts";

type Priority = "interactive" | "batch";
type Status = "idle" | "running" | "done" | "error" | "cancelled";

/* ─────────── status ─────────── */

function subscribeStatus(fn: () => void): () => void {
	return getPool().subscribe(() => fn());
}
function statusSnapshot(): EngineStatus {
	return getPool().status();
}

export function useEngineStatus(): EngineStatus {
	useEffect(() => {
		getPool()
			.ready()
			.catch(() => {});
	}, []);
	return useSyncExternalStore(subscribeStatus, statusSnapshot, statusSnapshot);
}

/* ─────────── tiny store helper ─────────── */

function store<T>(initial: T) {
	let value = initial;
	const ls = new Set<() => void>();
	return {
		get: () => value,
		set(v: T) {
			value = v;
			for (const fn of ls) fn();
		},
		subscribe(fn: () => void) {
			ls.add(fn);
			return () => {
				ls.delete(fn);
			};
		},
	};
}

/* ─────────── verdicts and spec summaries (per dataHash) ─────────── */

type Summaries = Record<string, { robustShare: number; n: number }>;
const verdicts = store<Record<string, VerdictRecord>>({});
const summaries = store<Summaries>({});
let storeHash: string | null = null;

function syncStores(hash: string | undefined): void {
	if (!hash || hash === storeHash) return;
	storeHash = hash;
	verdicts.set(loadVerdicts(hash));
	summaries.set(loadSpecSummaries(hash));
}

function ensureStores(): void {
	const s = getPool().status();
	if (s.state === "ready") syncStores(s.dataHash);
	else
		getPool()
			.ready()
			.then((st) => syncStores(st.dataHash))
			.catch(() => {});
}

function putVerdict(v: VerdictRecord): void {
	syncStores(v.dataHash);
	if (v.dataHash !== storeHash) return;
	const cur = verdicts.get();
	const prev = cur[v.hypothesisId];
	// an exploratory judgement never overwrites a real verdict
	if (v.verdict === "exploratory" && prev && prev.verdict !== "exploratory")
		return;
	const next = { ...cur, [v.hypothesisId]: v };
	verdicts.set(next);
	saveVerdicts(v.dataHash, next);
}

function putSummary(
	id: string,
	hash: string,
	s: { robustShare: number; n: number },
): void {
	syncStores(hash);
	if (hash !== storeHash) return;
	const next = { ...summaries.get(), [id]: s };
	summaries.set(next);
	saveSpecSummaries(hash, next);
}

export function useVerdicts(): Record<string, VerdictRecord> {
	useEffect(ensureStores, []);
	return useSyncExternalStore(verdicts.subscribe, verdicts.get, verdicts.get);
}

export function useSpecSummaries(): Record<
	string,
	{ robustShare: number; n: number }
> {
	useEffect(ensureStores, []);
	return useSyncExternalStore(
		summaries.subscribe,
		summaries.get,
		summaries.get,
	);
}

/* ─────────── runs: cache, in-flight sharing, logging ─────────── */

interface Norm {
	h: Hypothesis;
	spec: Spec;
	sk: string;
	R: number;
	seed: number;
	req: RunRequest;
	/** hypothesisId|specKey|R|seed, without the dataHash */
	id: string;
}

function normalise(req: RunRequest, override?: Hypothesis): Norm {
	const h = override ?? getHypothesis(req.hypothesisId);
	if (!h) throw new Error(`Unknown hypothesis ${req.hypothesisId}`);
	const spec = fullSpec(h, req.spec);
	const sk = specKey(spec);
	const R = Math.max(0, Math.floor(req.R ?? h.R));
	const seed = req.seed ?? DEFAULT_SEED;
	return {
		h,
		spec,
		sk,
		R,
		seed,
		req: { hypothesisId: req.hypothesisId, spec, R, seed },
		id: `${req.hypothesisId}|${sk}|${R}|${seed}`,
	};
}

const cache = new Map<string, RunResult>();

function cached(n: Norm): RunResult | undefined {
	const hash = getPool().status().dataHash;
	return hash ? cache.get(`${n.id}|${hash}`) : undefined;
}

/** Is a run exploratory (spends alpha) rather than a confirmatory default run? */
function isExploratory(n: Norm, kind: RunLogEntry["kind"]): boolean {
	return (
		kind === "spec" ||
		!isDefaultSpec(n.h, n.spec) ||
		n.R !== n.h.R ||
		n.seed !== DEFAULT_SEED
	);
}

interface Inflight {
	/** the hypothesis the run was started with (its judge ran on completion) */
	h: Hypothesis;
	promise: Promise<RunResult>;
	controller: AbortController;
	refs: number;
	settled: boolean;
	progress: [number, number] | null;
	listeners: Set<(p: [number, number]) => void>;
}

const inflight = new Map<string, Inflight>();

interface Handle {
	promise: Promise<RunResult>;
	onProgress(fn: (p: [number, number]) => void): void;
	release(): void;
	cancel(): void;
}

/**
 * `audit`: a run the page starts on its own to show supporting evidence (the
 * link audit, a scan-floor lookup). It is logged but spends no alpha and
 * gives no verdict: alpha-wealth meters the reader's own forking paths.
 */
function acquire(
	n: Norm,
	o: {
		priority: Priority;
		label?: string;
		kind: RunLogEntry["kind"];
		audit?: boolean;
	},
): Handle {
	let f = inflight.get(n.id);
	if (!f) {
		const controller = new AbortController();
		const fl: Inflight = {
			h: n.h,
			controller,
			refs: 0,
			settled: false,
			progress: null,
			listeners: new Set(),
			promise: Promise.resolve(null as unknown as RunResult),
		};
		let last = 0;
		fl.promise = getPool()
			.run(n.req, {
				signal: controller.signal,
				priority: o.priority,
				onProgress: (done, total) => {
					fl.progress = [done, total];
					const now = performance.now();
					if (now - last < 80 && done < total) return;
					last = now;
					for (const fn of fl.listeners) fn([done, total]);
				},
			})
			.then((r) => {
				cache.set(runKey(r.provenance), r);
				try {
					const exploratory = isExploratory(n, o.kind);
					logRun(r, o.label ?? n.h.label, o.kind, exploratory && !o.audit);
					if (!exploratory) putVerdict(judge(n.h, r));
				} catch {
					/* logging must never fail a run */
				}
				return r;
			})
			.finally(() => {
				fl.settled = true;
				if (inflight.get(n.id) === fl) inflight.delete(n.id);
			});
		fl.promise.catch(() => {});
		inflight.set(n.id, fl);
		f = fl;
	}
	const fl = f;
	fl.refs++;
	let released = false;
	let mine: ((p: [number, number]) => void) | null = null;
	const release = () => {
		if (released) return;
		released = true;
		if (mine) fl.listeners.delete(mine);
		fl.refs--;
		if (fl.refs <= 0 && !fl.settled) {
			fl.controller.abort();
			if (inflight.get(n.id) === fl) inflight.delete(n.id);
		}
	};
	return {
		promise: fl.promise.then((r) => {
			// a joiner with a claim-specific expectation (synthetic pair) is judged too
			if (n.h !== fl.h && n.h.expected && !isExploratory(n, o.kind))
				putVerdict(judge(n.h, r));
			return r;
		}),
		onProgress(fn) {
			mine = fn;
			fl.listeners.add(fn);
			if (fl.progress) fn(fl.progress);
		},
		release,
		cancel: () => {
			fl.controller.abort();
			if (inflight.get(n.id) === fl) inflight.delete(n.id);
			release();
		},
	};
}

function isAbort(e: unknown): boolean {
	return e instanceof Error && e.name === "AbortError";
}

function errText(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

/* ─────────── useRun ─────────── */

export interface RunState {
	status: Status;
	progress: [number, number] | null;
	result?: RunResult;
	error?: string;
	cancel(): void;
	/** start the same request again (after a cancel or an error) */
	rerun(): void;
}

interface RunInner {
	key: string | null;
	status: Status;
	progress: [number, number] | null;
	result?: RunResult;
	error?: string;
}

function reqKey(req: RunRequest | null): string | null {
	return req
		? JSON.stringify([
				req.hypothesisId,
				req.spec ?? null,
				req.R ?? null,
				req.seed ?? null,
			])
		: null;
}

function tryNorm(req: RunRequest | null, h?: Hypothesis): Norm | null {
	if (!req) return null;
	try {
		return normalise(req, h && h.id === req.hypothesisId ? h : undefined);
	} catch {
		return null;
	}
}

/**
 * Run one request. Starts when the request's content changes (not its
 * identity) and cancels on unmount or change. `hypothesis` (additive to §4.5)
 * lets a caller pass the claim-resolved hypothesis so a synthetic pair's
 * default run is judged against the claim's expectation.
 */
export function useRun(
	req: RunRequest | null,
	opts?: {
		priority?: Priority;
		label?: string;
		hypothesis?: Hypothesis;
		/** page-started supporting run: logged, spends no alpha (see acquire) */
		audit?: boolean;
	},
): RunState {
	const key = reqKey(req);
	const priority = opts?.priority ?? "interactive";
	const reqRef = useRef(req);
	reqRef.current = req;
	const optsRef = useRef(opts);
	optsRef.current = opts;
	const handleRef = useRef<Handle | null>(null);
	const [st, setSt] = useState<RunInner>({
		key: null,
		status: "idle",
		progress: null,
	});
	// bumped by rerun(): the same request key starts again
	const [gen, setGen] = useState(0);
	const status = useEngineStatus();

	// biome-ignore lint/correctness/useExhaustiveDependencies: gen restarts the same request
	useEffect(() => {
		const r = reqRef.current;
		if (!key || !r) {
			setSt({ key, status: "idle", progress: null });
			return;
		}
		let alive = true;
		let handle: Handle | null = null;
		(async () => {
			try {
				await getPool().ready();
				if (!alive) return;
				const n = normalise(r, optsRef.current?.hypothesis);
				const hit = cached(n);
				if (hit) {
					// a cached default run is judged again under this caller's
					// hypothesis (a claim sharing a pair id may carry its own)
					if (!isExploratory(n, "run") && !optsRef.current?.audit)
						putVerdict(judge(n.h, hit));
					setSt({ key, status: "done", progress: null, result: hit });
					return;
				}
				setSt({ key, status: "running", progress: null });
				handle = acquire(n, {
					priority,
					label: optsRef.current?.label,
					kind: "run",
					audit: optsRef.current?.audit,
				});
				handleRef.current = handle;
				handle.onProgress((p) => {
					if (alive) setSt((s) => (s.key === key ? { ...s, progress: p } : s));
				});
				const res = await handle.promise;
				if (alive) setSt({ key, status: "done", progress: null, result: res });
			} catch (e) {
				if (!alive) return;
				setSt((s) =>
					isAbort(e)
						? { key, status: "cancelled", progress: s.progress }
						: { key, status: "error", progress: null, error: errText(e) },
				);
			}
		})();
		return () => {
			alive = false;
			handle?.release();
			if (handleRef.current === handle) handleRef.current = null;
		};
	}, [key, priority, gen]);

	const cancel = useCallback(() => {
		handleRef.current?.cancel();
		setSt((s) => (s.status === "running" ? { ...s, status: "cancelled" } : s));
	}, []);
	const rerun = useCallback(() => setGen((g) => g + 1), []);

	if (st.key === key) return { ...st, cancel, rerun };
	// the request changed and the effect has not caught up: serve the cache or say running
	const n = status.state === "ready" ? tryNorm(req, opts?.hypothesis) : null;
	const hit = n ? cached(n) : undefined;
	if (hit)
		return { status: "done", progress: null, result: hit, cancel, rerun };
	return { status: key ? "running" : "idle", progress: null, cancel, rerun };
}

/* ─────────── many runs: shared engine for useBatch / useSpecCurve ─────────── */

interface JobsState {
	key: string | null;
	status: Status;
	progress: [number, number] | null;
	results: Record<string, RunResult>;
	errors: Record<string, string>;
}

const CONCURRENCY = 3;
const empty: JobsState = {
	key: null,
	status: "idle",
	progress: null,
	results: {},
	errors: {},
};

function useJobs(
	reqs: RunRequest[] | null,
	kind: RunLogEntry["kind"],
	priority: Priority,
	resolveH?: (id: string) => Hypothesis | undefined,
	audit = false,
): JobsState & { cancel(): void; restart(): void } {
	const key = reqs
		? JSON.stringify(
				reqs.map((r) => [
					r.hypothesisId,
					r.spec ?? null,
					r.R ?? null,
					r.seed ?? null,
				]),
			)
		: null;
	const reqsRef = useRef(reqs);
	reqsRef.current = reqs;
	const resolveRef = useRef(resolveH);
	resolveRef.current = resolveH;
	const cancelRef = useRef<() => void>(() => {});
	const [st, setSt] = useState<JobsState>(empty);
	// bumped by restart(): the same list of requests starts again
	const [gen, setGen] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: gen restarts the same list
	useEffect(() => {
		const list = reqsRef.current;
		if (!key || !list) {
			setSt({ ...empty, key });
			return;
		}
		let alive = true;
		const handles = new Set<Handle>();
		const results: Record<string, RunResult> = {};
		const errors: Record<string, string> = {};
		let done = 0;
		const total = list.length;
		const push = (status: Status) => {
			if (alive)
				setSt({
					key,
					status,
					progress: [done, total],
					results: { ...results },
					errors: { ...errors },
				});
		};
		cancelRef.current = () => {
			alive = false;
			for (const h of handles) h.cancel();
			setSt((s) => (s.key === key ? { ...s, status: "cancelled" } : s));
		};
		(async () => {
			try {
				await getPool().ready();
			} catch (e) {
				if (alive)
					setSt({
						...empty,
						key,
						status: "error",
						errors: { "*": errText(e) },
					});
				return;
			}
			if (!alive) return;
			const norms: (Norm | null)[] = list.map((r) => {
				try {
					return normalise(r, resolveRef.current?.(r.hypothesisId));
				} catch (e) {
					errors[`${r.hypothesisId}@?`] = errText(e);
					done++;
					return null;
				}
			});
			const todo: Norm[] = [];
			for (const n of norms) {
				if (!n) continue;
				const hit = cached(n);
				if (hit) {
					results[`${n.h.id}@${n.sk}`] = hit;
					done++;
				} else todo.push(n);
			}
			push(todo.length ? "running" : "done");
			let next = 0;
			const worker = async () => {
				while (alive && next < todo.length) {
					const n = todo[next++];
					const h = acquire(n, { priority, kind, audit });
					handles.add(h);
					try {
						results[`${n.h.id}@${n.sk}`] = await h.promise;
					} catch (e) {
						if (!alive) return;
						if (!isAbort(e)) errors[`${n.h.id}@${n.sk}`] = errText(e);
					} finally {
						handles.delete(h);
					}
					done++;
					push(done >= total ? "done" : "running");
				}
			};
			await Promise.all(
				Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker),
			);
		})();
		return () => {
			alive = false;
			for (const h of handles) h.release();
		};
	}, [key, kind, priority, audit, gen]);

	const cancel = useCallback(() => cancelRef.current(), []);
	const restart = useCallback(() => setGen((g) => g + 1), []);
	if (st.key === key) return { ...st, cancel, restart };
	return { ...empty, key, status: key ? "running" : "idle", cancel, restart };
}

export function useBatch(
	reqs: RunRequest[] | null,
	opts?: {
		priority?: Priority;
		hypothesisFor?: (id: string) => Hypothesis | undefined;
		/** page-started supporting runs: logged, spend no alpha (see acquire) */
		audit?: boolean;
	},
): {
	status: RunState["status"];
	progress: [number, number] | null;
	results: Record<string, RunResult>;
	errors: Record<string, string>;
	cancel(): void;
} {
	const j = useJobs(
		reqs,
		"batch",
		opts?.priority ?? "batch",
		opts?.hypothesisFor,
		opts?.audit ?? false,
	);
	return {
		status: j.status,
		progress: j.progress,
		results: j.results,
		errors: j.errors,
		cancel: j.cancel,
	};
}

/* ─────────── spec curve ─────────── */

function pointsFrom(
	h: Hypothesis,
	grid: Spec[],
	results: Record<string, RunResult>,
): SpecPoint[] {
	const raw = grid.map((spec) => {
		const sk = specKey(spec);
		const r = results[`${h.id}@${sk}`];
		let nullLo: number | null = null;
		let nullHi: number | null = null;
		if (r?.nulls?.length) {
			nullLo = quantile(r.nulls, 0.025);
			nullHi = quantile(r.nulls, 0.975);
		} else if (r && r.nullMean != null && r.nullSd != null) {
			nullLo = r.nullMean - 1.96 * r.nullSd;
			nullHi = r.nullMean + 1.96 * r.nullSd;
		}
		return {
			spec,
			specKey: sk,
			observed: r ? r.observed : Number.NaN,
			nullMean: r?.nullMean ?? null,
			nullLo,
			nullHi,
			z: r?.z ?? null,
			p: r?.p ?? null,
			q: null as number | null,
			isDefault: isDefaultSpec(h, spec),
			ok: !!r,
		};
	});
	const idx: number[] = [];
	const ps: number[] = [];
	raw.forEach((pt, i) => {
		if (pt.p != null && Number.isFinite(pt.p)) {
			idx.push(i);
			ps.push(pt.p);
		}
	});
	const qs = bh(ps);
	idx.forEach((i, k) => {
		raw[i].q = qs[k];
	});
	return raw.filter((p) => p.ok).map(({ ok: _ok, ...p }) => p);
}

/**
 * Share of the specifications that keep the claim (controls left out) in
 * which the claim holds, by `specHolds` (so a claim that must stay at chance
 * holds where the result is at chance).
 */
export function robustOf(h: Hypothesis, points: SpecPoint[]): number | null {
	const def = points.find((p) => p.isDefault);
	const kept = points.filter((p) => p.q != null && keepsClaim(h, p.spec));
	if (!kept.length) return null;
	const ok = kept.filter((p) => specHolds(h, p, def?.z ?? null));
	return ok.length / kept.length;
}

export function useSpecCurve(
	h: Hypothesis | null,
	enabled: boolean,
	R?: number,
): {
	status: RunState["status"];
	progress: [number, number] | null;
	points: SpecPoint[];
	robustShare: number | null;
	cancel(): void;
	restart(): void;
} {
	const grid = h ? specGrid(h) : [];
	const Rx = h ? (R ?? Math.min(h.R, 200)) : 0;
	const reqs =
		h && enabled
			? grid.map((spec) => ({ hypothesisId: h.id, spec, R: Rx }))
			: null;
	const hRef = useRef(h);
	hRef.current = h;
	const resolve = useCallback(
		(id: string) => (hRef.current?.id === id ? hRef.current : undefined),
		[],
	);
	const j = useJobs(reqs, "spec", "interactive", resolve);
	const status = useEngineStatus();

	// not enabled: show a curve already computed in this session, if complete
	let results = j.results;
	if (!enabled && h && status.state === "ready") {
		const got: Record<string, RunResult> = {};
		let all = grid.length > 0;
		for (const spec of grid) {
			const n = tryNorm({ hypothesisId: h.id, spec, R: Rx }, h);
			const hit = n ? cached(n) : undefined;
			if (hit) got[`${h.id}@${specKey(spec)}`] = hit;
			else all = false;
		}
		if (all) results = got;
	}
	const points = h ? pointsFrom(h, grid, results) : [];
	const complete = !!h && points.length === grid.length && grid.length > 0;
	const robustShare = complete && h ? robustOf(h, points) : null;

	const hash = status.dataHash;
	const hid = h?.id;
	useEffect(() => {
		if (complete && hid && hash && robustShare != null)
			putSummary(hid, hash, { robustShare, n: grid.length });
	}, [complete, hid, hash, robustShare, grid.length]);

	return {
		status: !enabled && complete ? "done" : j.status,
		progress: j.progress,
		points,
		robustShare,
		cancel: j.cancel,
		restart: j.restart,
	};
}

/* ─────────── replicate all ─────────── */

const COST_RANK: Record<Hypothesis["cost"], number> = {
	instant: 0,
	seconds: 1,
	heavy: 2,
};

interface AllState {
	status: Status;
	progress: [number, number] | null;
}
const allStore = store<AllState>({ status: "idle", progress: null });
let allHandles = new Set<Handle>();
let allRun = 0;

function replicateAllList(): Hypothesis[] {
	return HYPOTHESES.filter((h) => h.expected).sort(
		(a, b) => COST_RANK[a.cost] - COST_RANK[b.cost] || a.R - b.R,
	);
}

function startAll(): void {
	if (allStore.get().status === "running") return;
	const run = ++allRun;
	const list = replicateAllList();
	let done = 0;
	allHandles = new Set();
	allStore.set({ status: "running", progress: [0, list.length] });
	(async () => {
		try {
			await getPool().ready();
		} catch {
			allStore.set({ status: "error", progress: null });
			return;
		}
		ensureStores();
		let next = 0;
		let failed = false;
		const worker = async () => {
			while (run === allRun && next < list.length) {
				const h = list[next++];
				const n = normalise({ hypothesisId: h.id }, h);
				const hit = cached(n);
				if (hit) putVerdict(judge(h, hit));
				else {
					const handle = acquire(n, {
						priority: "batch",
						kind: "replicate",
						label: h.label,
					});
					allHandles.add(handle);
					try {
						await handle.promise;
					} catch (e) {
						if (!isAbort(e)) failed = true;
					} finally {
						allHandles.delete(handle);
					}
				}
				if (run !== allRun) return;
				done++;
				allStore.set({ status: "running", progress: [done, list.length] });
			}
		};
		await Promise.all([worker(), worker()]);
		if (run === allRun)
			allStore.set({
				status: failed ? "error" : "done",
				progress: [done, list.length],
			});
	})();
}

function cancelAll(): void {
	if (allStore.get().status !== "running") return;
	allRun++;
	for (const h of allHandles) h.cancel();
	allHandles = new Set();
	allStore.set({ status: "cancelled", progress: allStore.get().progress });
}

export function useReplicateAll(): {
	start(): void;
	cancel(): void;
	status: RunState["status"];
	progress: [number, number] | null;
} {
	const s = useSyncExternalStore(
		allStore.subscribe,
		allStore.get,
		allStore.get,
	);
	return {
		start: startAll,
		cancel: cancelAll,
		status: s.status,
		progress: s.progress,
	};
}

/** The registry entries Replicate all runs, cheapest first (for the EngineBar tally). */
export function replicateAllIds(): string[] {
	return replicateAllList().map((h) => h.id);
}
