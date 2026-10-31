/**
 * The engine's worker pool (browser only). A lazy singleton of module
 * workers, min(8, cores - 1), each holding the corpus once. A run is cut into
 * tasks (the observation, replicate chunks of ceil(R / workers), or unit
 * batches largest khipu first) that free workers pull from a two-level queue:
 * interactive tasks always go before batch tasks, so a click pre-empts a
 * background audit at the next chunk boundary. Aborting a run terminates the
 * workers busy with its tasks (workers never poll for cancellation) and they
 * are respawned lazily. Results go through hypothesis.ts `assemble`, the same
 * path as the single-thread `runHypothesis`, so the nulls are identical.
 */
import type {
	EngineStatus,
	Observation,
	RunRequest,
	RunResult,
	Spec,
	UnitResult,
	ValueSource,
	WorkerRequest,
	WorkerResponse,
} from "#/lib/next/types";
import { corpusFor } from "./corpus.ts";
import {
	assemble,
	DEFAULT_SEED,
	fullSpec,
	runHypothesis,
} from "./hypothesis.ts";
import { loadCorpus } from "./load.ts";
import { getExecutor, getHypothesis } from "./registry.ts";

export interface RunOptions {
	signal?: AbortSignal;
	onProgress?: (done: number, total: number) => void;
	priority?: "interactive" | "batch";
}

export interface EnginePool {
	status(): EngineStatus;
	subscribe(fn: (s: EngineStatus) => void): () => void;
	ready(): Promise<EngineStatus>;
	run(req: RunRequest, opts?: RunOptions): Promise<RunResult>;
}

/* distributive Omit, so each WorkerRequest variant keeps its own fields */
type Body<T> = T extends unknown ? Omit<T, "id"> : never;
type TaskBody = Body<WorkerRequest>;

interface Task {
	id: number;
	body: TaskBody;
	priority: "interactive" | "batch";
	job: Job;
	slot: Slot | null;
	done: number;
	settled: boolean;
	resolve(r: WorkerResponse): void;
	reject(e: Error): void;
}

interface Job {
	tasks: Set<Task>;
	aborted: boolean;
	onTaskProgress(): void;
}

interface Slot {
	index: number;
	worker: Worker | null;
	state: "empty" | "starting" | "idle" | "busy";
	initId: number;
	task: Task | null;
	failures: number;
}

const MAX_INIT_FAILURES = 3;
let nextId = 1;

function abortError(): Error {
	try {
		return new DOMException("The run was cancelled.", "AbortError");
	} catch {
		const e = new Error("The run was cancelled.");
		e.name = "AbortError";
		return e;
	}
}

function workerCount(): number {
	const hc =
		typeof navigator !== "undefined" && navigator.hardwareConcurrency
			? navigator.hardwareConcurrency
			: 4;
	return Math.min(8, Math.max(1, hc - 1));
}

class Pool implements EnginePool {
	private st: EngineStatus;
	private listeners = new Set<(s: EngineStatus) => void>();
	private slots: Slot[] = [];
	private queue: { interactive: Task[]; batch: Task[] } = {
		interactive: [],
		batch: [],
	};
	private readyP: Promise<EngineStatus> | null = null;
	private fallback = false;
	private readonly n: number;

	constructor() {
		this.n = typeof Worker === "undefined" ? 0 : workerCount();
		this.st = { state: "idle", workers: this.n };
	}

	status(): EngineStatus {
		return this.st;
	}

	subscribe(fn: (s: EngineStatus) => void): () => void {
		this.listeners.add(fn);
		return () => {
			this.listeners.delete(fn);
		};
	}

	private set(s: Partial<EngineStatus>): void {
		this.st = { ...this.st, ...s };
		for (const fn of this.listeners) fn(this.st);
	}

	ready(): Promise<EngineStatus> {
		if (!this.readyP) {
			this.set({ state: "loading", error: undefined });
			const p = this.n === 0 ? this.startFallback() : this.startWorkers();
			p.catch((e: unknown) => {
				this.set({
					state: "error",
					error: e instanceof Error ? e.message : String(e),
				});
				if (this.readyP === p) this.readyP = null;
			});
			this.readyP = p;
		}
		return this.readyP;
	}

	private async startFallback(): Promise<EngineStatus> {
		this.fallback = true;
		const c = await loadCorpus();
		this.set({
			state: "ready",
			dataHash: c.dataHash,
			nKhipus: c.khipus.length,
			workers: 0,
		});
		return this.st;
	}

	private startWorkers(): Promise<EngineStatus> {
		return new Promise<EngineStatus>((resolve) => {
			let settled = false;
			let failed = 0;
			const onReady = (dataHash: string, nKhipus: number) => {
				if (settled) return;
				settled = true;
				this.set({ state: "ready", dataHash, nKhipus, workers: this.n });
				resolve(this.st);
			};
			const onFail = () => {
				failed++;
				if (settled || failed < this.n) return;
				// no worker could start: run on the main thread instead
				settled = true;
				for (const s of this.slots) this.kill(s);
				this.slots = [];
				this.startFallback().then(resolve, (e) => {
					this.set({
						state: "error",
						error: e instanceof Error ? e.message : String(e),
					});
					resolve(this.st);
				});
			};
			for (let i = 0; i < this.n; i++) {
				const slot: Slot = {
					index: i,
					worker: null,
					state: "empty",
					initId: 0,
					task: null,
					failures: 0,
				};
				this.slots.push(slot);
				this.spawn(slot, onReady, onFail);
			}
		});
	}

	private spawn(
		slot: Slot,
		onReady?: (dataHash: string, nKhipus: number) => void,
		onFail?: () => void,
	): void {
		let w: Worker;
		try {
			w = new Worker(new URL("./engine.worker.ts", import.meta.url), {
				type: "module",
			});
		} catch {
			slot.failures = MAX_INIT_FAILURES;
			onFail?.();
			return;
		}
		slot.worker = w;
		slot.state = "starting";
		slot.initId = nextId++;
		const initFailed = () => {
			slot.failures++;
			this.kill(slot);
			onFail?.();
			this.dispatch();
		};
		w.onmessage = (e: MessageEvent<WorkerResponse>) => {
			const r = e.data;
			if (slot.state === "starting" && r.id === slot.initId) {
				if (r.type === "ready") {
					slot.state = "idle";
					slot.failures = 0;
					onReady?.(r.dataHash, r.nKhipus);
					this.dispatch();
				} else initFailed();
				return;
			}
			const t = slot.task;
			if (!t || t.id !== r.id) return;
			if (r.type === "progress") {
				t.done = r.done;
				t.job.onTaskProgress();
				return;
			}
			slot.task = null;
			slot.state = "idle";
			t.slot = null;
			if (r.type === "error") this.settle(t, new Error(r.message));
			else this.settle(t, r);
			this.dispatch();
		};
		w.onerror = (ev: ErrorEvent) => {
			ev.preventDefault?.();
			if (slot.state === "starting") {
				initFailed();
				return;
			}
			const t = slot.task;
			this.kill(slot);
			if (t) this.settle(t, new Error(ev.message || "engine worker crashed"));
			this.dispatch();
		};
		w.postMessage({ id: slot.initId, op: "init" } satisfies WorkerRequest);
	}

	private kill(slot: Slot): void {
		slot.worker?.terminate();
		slot.worker = null;
		slot.state = "empty";
		if (slot.task) slot.task.slot = null;
		slot.task = null;
	}

	private settle(t: Task, r: WorkerResponse | Error): void {
		if (t.settled) return;
		t.settled = true;
		t.job.tasks.delete(t);
		if (r instanceof Error) t.reject(r);
		else t.resolve(r);
	}

	private dispatch(): void {
		for (;;) {
			const q = this.queue.interactive.length
				? this.queue.interactive
				: this.queue.batch;
			if (!q.length) return;
			const slot = this.slots.find((s) => s.state === "idle");
			if (!slot) {
				// respawn terminated workers lazily, only when there is work
				for (const s of this.slots)
					if (s.state === "empty" && s.failures < MAX_INIT_FAILURES)
						this.spawn(s);
				if (!this.slots.some((s) => s.state !== "empty")) {
					const err = new Error("no engine worker could start");
					for (const t of [...this.queue.interactive, ...this.queue.batch])
						this.settle(t, err);
					this.queue.interactive = [];
					this.queue.batch = [];
				}
				return;
			}
			const t = q.shift() as Task;
			slot.state = "busy";
			slot.task = t;
			t.slot = slot;
			slot.worker?.postMessage({ ...t.body, id: t.id } as WorkerRequest);
		}
	}

	private enqueue(job: Job, body: TaskBody, priority: Task["priority"]) {
		return new Promise<WorkerResponse>((resolve, reject) => {
			const t: Task = {
				id: nextId++,
				body,
				priority,
				job,
				slot: null,
				done: 0,
				settled: false,
				resolve,
				reject,
			};
			job.tasks.add(t);
			this.queue[priority].push(t);
			this.dispatch();
		});
	}

	private abortJob(job: Job): void {
		job.aborted = true;
		const err = abortError();
		for (const t of [...job.tasks]) {
			if (t.slot) this.kill(t.slot);
			else {
				const q = this.queue[t.priority];
				const i = q.indexOf(t);
				if (i >= 0) q.splice(i, 1);
			}
			this.settle(t, err);
		}
		this.dispatch();
	}

	async run(req: RunRequest, opts: RunOptions = {}): Promise<RunResult> {
		const { signal, onProgress } = opts;
		const priority = opts.priority ?? "interactive";
		if (signal?.aborted) throw abortError();
		await this.ready();
		if (signal?.aborted) throw abortError();
		if (this.fallback || this.slots.length === 0) {
			const c = await loadCorpus();
			return runHypothesis(c, req, { signal, onProgress });
		}
		const h = getHypothesis(req.hypothesisId);
		if (!h) throw new Error(`Unknown hypothesis ${req.hypothesisId}`);
		const ex = getExecutor(req.hypothesisId);
		const spec: Spec = fullSpec(h, req.spec);
		const R = Math.max(0, Math.floor(req.R ?? h.R));
		const seed = req.seed ?? DEFAULT_SEED;
		const wreq: RunRequest = { hypothesisId: h.id, spec, R, seed };
		const t0 = performance.now();
		const dataHash = this.st.dataHash ?? "";

		let total = 1;
		const job: Job = {
			tasks: new Set(),
			aborted: false,
			onTaskProgress: () => {
				if (!onProgress || job.aborted) return;
				let done = 0;
				for (const t of job.tasks) done += t.done;
				onProgress(Math.min(total, finished + done), total);
			},
		};
		let finished = 0;
		const onAbort = () => this.abortJob(job);
		signal?.addEventListener("abort", onAbort, { once: true });
		const track = <T>(p: Promise<T>, weight: number): Promise<T> =>
			p.then((v) => {
				finished += weight;
				if (onProgress && !job.aborted)
					onProgress(Math.min(total, finished), total);
				return v;
			});
		const submit = (body: TaskBody, weight: number) =>
			track(this.enqueue(job, body, priority), weight);

		try {
			let obs: Observation | null = null;
			let nulls: Float64Array | null = null;
			let analytic: { mean: number; sd: number } | null = null;
			let units: UnitResult[] | null = null;

			if (ex.nullKind === "replicate" && ex.replicate && R > 0) {
				total = R;
				nulls = new Float64Array(R);
				const size = Math.ceil(R / this.n);
				const obsP = this.enqueue(job, { op: "observe", req: wreq }, priority);
				const parts: Promise<void>[] = [];
				for (let from = 0; from < R; from += size) {
					const to = Math.min(R, from + size);
					const out = nulls;
					parts.push(
						submit({ op: "replicates", req: wreq, from, to }, to - from).then(
							(r) => {
								if (r.type === "replicates") out.set(r.values, r.from);
							},
						),
					);
				}
				const [o] = await Promise.all([obsP, ...parts]);
				if (o.type === "observed") obs = o.obs;
			} else if (ex.nullKind === "analytic" && ex.analytic) {
				const [o, a] = await Promise.all([
					this.enqueue(job, { op: "observe", req: wreq }, priority),
					submit({ op: "analytic", req: wreq }, 1),
				]);
				if (o.type === "observed") obs = o.obs;
				if (a.type === "analytic") analytic = { mean: a.mean, sd: a.sd };
			} else if (ex.nullKind === "units" && ex.units && ex.runUnit) {
				const c = await loadCorpus();
				const src = (spec.valueSource ?? "kfg") as ValueSource;
				const cc = corpusFor(c, src === "knots" ? "knots" : "kfg");
				const list = ex.units(cc, spec);
				total = Math.max(1, list.length);
				const batches = unitBatches(
					list,
					(u) => cc.byId.get(u)?.seq.length ?? 1,
					this.n,
				);
				const got = new Map<string, UnitResult>();
				const obsP = ex.combine
					? null
					: this.enqueue(job, { op: "observe", req: wreq }, priority);
				await Promise.all(
					batches.map((b) =>
						submit({ op: "units", req: wreq, units: b }, b.length).then((r) => {
							if (r.type === "units")
								r.results.forEach((res, i) => {
									got.set(b[i], res);
								});
						}),
					),
				);
				units = list.map((u) => got.get(u) as UnitResult);
				if (ex.combine) obs = ex.combine(units, spec);
				else if (obsP) {
					const o = await obsP;
					if (o.type === "observed") obs = o.obs;
				}
			} else {
				const o = await submit({ op: "observe", req: wreq }, 1);
				if (o.type === "observed") obs = o.obs;
			}
			if (!obs) throw new Error(`${h.id}: no observation came back`);
			const ms = performance.now() - t0;
			return assemble(
				h,
				spec,
				seed,
				R,
				obs,
				nulls,
				analytic,
				units,
				dataHash,
				Math.round(ms),
				this.n,
			);
		} catch (e) {
			if (job.aborted || signal?.aborted) throw abortError();
			this.abortJob(job);
			throw e;
		} finally {
			signal?.removeEventListener("abort", onAbort);
		}
	}
}

/**
 * Split units into tasks, largest khipu first: the biggest units get tasks of
 * their own, the long tail is packed into tasks of about a quarter of a
 * worker's fair share, so the pool stays balanced as workers pull tasks.
 */
function unitBatches(
	units: string[],
	size: (u: string) => number,
	workers: number,
): string[][] {
	const sorted = [...units].sort((a, b) => size(b) - size(a));
	let sum = 0;
	for (const u of sorted) sum += size(u);
	const cap = Math.max(1, sum / Math.max(1, workers * 4));
	const out: string[][] = [];
	let cur: string[] = [];
	let acc = 0;
	for (const u of sorted) {
		const s = size(u);
		if (cur.length && acc + s > cap) {
			out.push(cur);
			cur = [];
			acc = 0;
		}
		cur.push(u);
		acc += s;
	}
	if (cur.length) out.push(cur);
	return out;
}

let pool: Pool | null = null;

declare global {
	interface Window {
		__nextEngine?: {
			pool: EnginePool;
			runLocal: (req: RunRequest) => Promise<RunResult>;
		};
	}
}

export function getPool(): EnginePool {
	if (!pool) {
		pool = new Pool();
		if (import.meta.env.DEV && typeof window !== "undefined") {
			const p = pool;
			window.__nextEngine = {
				pool: p,
				runLocal: (req) => loadCorpus().then((c) => runHypothesis(c, req)),
			};
		}
	}
	return pool;
}
