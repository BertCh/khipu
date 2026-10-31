/// <reference lib="webworker" />
/**
 * One engine worker. It loads the corpus once, then answers pool requests
 * (engine/pool.ts) by running registry executors: the observation, a slice of
 * null replicates, the analytic null or a batch of units. Seeds come from
 * hypothesis.ts (replicateSeed / unitSeed), so a slice computed here equals
 * the same slice computed by runHypothesis on one thread.
 */
import type {
	CorpusLite,
	RunRequest,
	Spec,
	ValueSource,
	WorkerRequest,
	WorkerResponse,
} from "#/lib/next/types";
import { corpusFor } from "./corpus.ts";
import {
	DEFAULT_SEED,
	fullSpec,
	replicateSeed,
	unitSeed,
} from "./hypothesis.ts";
import { loadCorpus } from "./load.ts";
import { getExecutor, getHypothesis } from "./registry.ts";
import { mulberry32 } from "./rng.ts";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const PROGRESS_MS = 100;

function post(msg: WorkerResponse, transfer?: Transferable[]): void {
	if (transfer) ctx.postMessage(msg, transfer);
	else ctx.postMessage(msg);
}

function prepare(c: CorpusLite, req: RunRequest) {
	const h = getHypothesis(req.hypothesisId);
	if (!h) throw new Error(`unknown hypothesis ${req.hypothesisId}`);
	const ex = getExecutor(req.hypothesisId);
	const spec: Spec = fullSpec(h, req.spec);
	const src = (spec.valueSource ?? "kfg") as ValueSource;
	const cc = corpusFor(c, src === "knots" ? "knots" : "kfg");
	const seed = req.seed ?? DEFAULT_SEED;
	return { h, ex, spec, cc, seed };
}

async function handle(m: WorkerRequest): Promise<void> {
	const c = await loadCorpus();
	switch (m.op) {
		case "init": {
			post({
				id: m.id,
				type: "ready",
				dataHash: c.dataHash,
				nKhipus: c.khipus.length,
			});
			return;
		}
		case "observe": {
			const { ex, spec, cc } = prepare(c, m.req);
			post({ id: m.id, type: "observed", obs: ex.observe(cc, spec) });
			return;
		}
		case "analytic": {
			const { ex, spec, cc } = prepare(c, m.req);
			if (!ex.analytic)
				throw new Error(`${m.req.hypothesisId}: no analytic null`);
			const a = ex.analytic(cc, spec);
			post({ id: m.id, type: "analytic", mean: a.mean, sd: a.sd });
			return;
		}
		case "replicates": {
			const { h, ex, spec, cc, seed } = prepare(c, m.req);
			const replicate = ex.replicate;
			if (!replicate)
				throw new Error(`${m.req.hypothesisId}: no replicate null`);
			const n = Math.max(0, m.to - m.from);
			const values = new Float64Array(n);
			let last = performance.now();
			for (let i = 0; i < n; i++) {
				const rng = mulberry32(replicateSeed(h, spec, seed, m.from + i));
				values[i] = replicate(cc, spec, rng);
				const now = performance.now();
				if (now - last >= PROGRESS_MS) {
					last = now;
					post({ id: m.id, type: "progress", done: i + 1, total: n });
				}
			}
			post({ id: m.id, type: "replicates", from: m.from, values }, [
				values.buffer,
			]);
			return;
		}
		case "units": {
			const { h, ex, spec, cc, seed } = prepare(c, m.req);
			const runUnit = ex.runUnit;
			if (!runUnit) throw new Error(`${m.req.hypothesisId}: no units`);
			const results = [];
			let last = performance.now();
			for (let i = 0; i < m.units.length; i++) {
				const u = m.units[i];
				results.push(runUnit(cc, spec, u, unitSeed(h, spec, seed, u)));
				const now = performance.now();
				if (now - last >= PROGRESS_MS) {
					last = now;
					post({
						id: m.id,
						type: "progress",
						done: i + 1,
						total: m.units.length,
					});
				}
			}
			post({ id: m.id, type: "units", results });
			return;
		}
	}
}

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
	const m = e.data;
	handle(m).catch((err: unknown) => {
		post({
			id: m.id,
			type: "error",
			message: err instanceof Error ? err.message : String(err),
		});
	});
};
