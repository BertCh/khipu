import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SEED, fullSpec, replicateSeed } from "#/lib/engine/hypothesis";
import { getExecutor, getHypothesis } from "#/lib/engine/registry";
import { mulberry32 } from "#/lib/engine/rng";
import { runChunked } from "#/lib/matching/against-chance/liveRun";
import type { CorpusLite, Observation, Spec } from "#/lib/next/types";

/**
 * Runs one of the registry's own hypotheses (`src/lib/engine/registry.ts`)
 * live, in this browser: the same `observe`/`replicate` executor, the same
 * `fullSpec`/`replicateSeed`/`DEFAULT_SEED` seed schedule as
 * `/next/proving-ground` and the single-thread reference runner in
 * `src/lib/engine/hypothesis.ts`. At the default spec and seed, the p-value
 * this produces is the same number the Proving Ground would show for the
 * same claim.
 *
 * Replicates run in chunks via `runChunked` (liveRun.ts) so `nulls` grows
 * progressively — a figure can bind straight to it for a live-updating
 * histogram, no separate "reveal" step required.
 */
export interface LiveNull {
	hypothesisId: string;
	/** undefined until `corpus` is ready */
	obs: Observation | undefined;
	spec: Spec;
	R: number;
	/** grows as replicates complete; length R once done */
	nulls: number[];
	running: boolean;
	done: boolean;
	/** starts (or restarts) the replicate run; a no-op while already running */
	run: () => void;
}

export function useLiveNull(
	hypothesisId: string,
	corpus: CorpusLite | null,
	specOverride?: Spec,
): LiveNull {
	const h = useMemo(() => getHypothesis(hypothesisId), [hypothesisId]);
	const ex = useMemo(() => getExecutor(hypothesisId), [hypothesisId]);
	const spec = useMemo(
		() => (h ? fullSpec(h, specOverride) : {}),
		[h, specOverride],
	);
	const [nulls, setNulls] = useState<number[]>([]);
	const [running, setRunning] = useState(false);
	const cancelRef = useRef<(() => void) | null>(null);

	const obs = useMemo(() => {
		if (!corpus || !h) return undefined;
		return ex.observe(corpus, spec);
	}, [corpus, h, ex, spec]);

	// a spec or corpus change invalidates any run in progress or finished
	// biome-ignore lint/correctness/useExhaustiveDependencies: corpus/spec are watched only to reset on change, not read in the body
	useEffect(() => {
		cancelRef.current?.();
		cancelRef.current = null;
		setNulls([]);
		setRunning(false);
	}, [corpus, spec]);

	useEffect(() => () => cancelRef.current?.(), []);

	const R = h?.R ?? 0;
	const run = () => {
		if (!corpus || !h || running || nulls.length >= R) return;
		const replicate = ex.replicate;
		if (!replicate) return;
		setRunning(true);
		cancelRef.current = runChunked(
			R,
			(i) =>
				replicate(
					corpus,
					spec,
					mulberry32(replicateSeed(h, spec, DEFAULT_SEED, i)),
				),
			(values, done, total) => {
				setNulls(values);
				if (done >= total) setRunning(false);
			},
		);
	};

	return {
		hypothesisId,
		obs,
		spec,
		R,
		nulls,
		running,
		done: R > 0 && nulls.length >= R,
		run,
	};
}
