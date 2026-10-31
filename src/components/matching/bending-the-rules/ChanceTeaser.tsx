import { useMemo } from "react";
import NullHistogram from "#/components/matching/NullHistogram";
import { mulberry32, seedFor } from "#/lib/engine/rng";
import { pairExecFrom } from "#/lib/engine/tests/pair";
import type { CorpusLite, Spec } from "#/lib/next/types";

export const N_SHUFFLES = 24;
const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * A preview, not a test: KH0303×KH0304's score against a handful of shuffles
 * of KH0304's sequence, run with the exact executor pair.ts uses for this
 * (`pairExecFrom`). Chapter 5 ("Against chance") runs this properly, with
 * many more shuffles and the +1-corrected p-value. Source:
 * src/lib/engine/tests/pair.ts, src/lib/engine/nulls.ts.
 */
export default function ChanceTeaser({ corpus }: { corpus: CorpusLite }) {
	const { observed, nulls } = useMemo(() => {
		const exec = pairExecFrom("KH0303", "KH0304");
		const spec: Spec = { statistic: "sw" };
		const obs = round1(exec.observe(corpus, spec).value);
		const replicate = exec.replicate;
		const draws: number[] = [];
		if (replicate) {
			for (let s = 0; s < N_SHUFFLES; s++) {
				const rng = mulberry32(seedFor("matching-btr-teaser", s));
				draws.push(round1(replicate(corpus, spec, rng)));
			}
		}
		return { observed: obs, nulls: draws };
	}, [corpus]);

	return (
		<div className="btr-teaser">
			<NullHistogram
				nulls={nulls}
				observed={observed}
				direction="upper"
				label="KH0303×KH0304"
				width={480}
				height={140}
			/>
		</div>
	);
}
