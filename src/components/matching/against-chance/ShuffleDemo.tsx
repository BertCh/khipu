import { useMemo, useState } from "react";
import OriginStrip from "#/components/matching/OriginStrip";
import PermutationArcs from "#/components/matching/PermutationArcs";
import TracePlayer from "#/components/matching/TracePlayer";
import { useTrace } from "#/components/matching/useTrace";
import { mulberry32, seedFor } from "#/lib/engine/rng";
import { fisherYates } from "#/lib/matching/shuffleTrace";

const N = 16;

/** The identity permutation with `swaps[0..upTo)` applied, in order — the
 * exact in-progress state `fisherYates`'s own loop would be in at that
 * point, replayed from the swap list it already recorded. */
function applySwapsUpTo(
	n: number,
	swaps: readonly [number, number][],
	upTo: number,
): Int32Array {
	const perm = Int32Array.from({ length: n }, (_, i) => i);
	for (let k = 0; k < upTo; k++) {
		const [i, j] = swaps[k];
		const t = perm[i];
		perm[i] = perm[j];
		perm[j] = t;
	}
	return perm;
}

/**
 * Fisher–Yates, step by step: `src/lib/matching/shuffleTrace.ts`'s
 * `fisherYates`, an instrumented copy of `src/lib/engine/rng.ts`'s
 * `shuffleInPlace` loop (same draw order, high index to low). A seeded
 * generator means "shuffle again" with the same seed would retrace these
 * same swaps exactly; the button below draws a fresh seed instead.
 */
export default function ShuffleDemo() {
	const [round, setRound] = useState(0);
	const seed = useMemo(
		() => seedFor("matching:against-chance:shuffle-demo", round),
		[round],
	);
	const { swaps } = useMemo(() => fisherYates(N, mulberry32(seed)), [seed]);
	const state = useTrace(swaps.length + 1, {
		fps: 1.2,
		reducedStep: swaps.length,
	});
	const stepPerm = useMemo(
		() => applySwapsUpTo(N, swaps, state.step),
		[swaps, state.step],
	);
	const lastSwap = state.step > 0 ? swaps[state.step - 1] : null;

	return (
		<div className="ac-figure">
			<TracePlayer
				state={state}
				label="Fisher–Yates shuffle"
				ticks={[0, 5, 10, swaps.length]}
				caption={
					lastSwap == null
						? "Before any swap: tile i sits at position i."
						: lastSwap[0] === lastSwap[1]
							? `Swap ${state.step} of ${swaps.length}: position ${lastSwap[0]} is drawn against itself — no move.`
							: `Swap ${state.step} of ${swaps.length}: position ${lastSwap[0]} trades places with position ${lastSwap[1]}.`
				}
			>
				<PermutationArcs
					n={N}
					perm={stepPerm}
					mode="arcsAboveOne"
					swaps={swaps.slice(0, state.step)}
				/>
			</TracePlayer>
			<OriginStrip n={N} perm={stepPerm} cellSize={22} labelEvery={4} />
			<p className="muted ac-seed-line">
				Seed <code>{seed}</code> — run it again with this same seed and every
				swap above repeats exactly.{" "}
				<button
					type="button"
					className="btn"
					onClick={() => setRound((r) => r + 1)}
				>
					Shuffle again, new seed
				</button>
			</p>
		</div>
	);
}
