import { useMemo } from "react";
import BiasMatrix from "#/components/matching/BiasMatrix";
import OriginStrip from "#/components/matching/OriginStrip";
import { mulberry32, seedFor } from "#/lib/engine/rng";
import {
	biasMatrix,
	nullPerm,
	type TapeNullModel,
} from "#/lib/matching/shuffleTrace";

const DRAWS = 600;

/**
 * One null model, illustrated on a real tape: a single draw (OriginStrip,
 * coloured by each cord's original position) and the probability every
 * position can land anywhere, estimated over many draws (BiasMatrix —
 * Bostock's "will it shuffle?" idiom). Both come from
 * `src/lib/matching/shuffleTrace.ts`'s `nullPerm`/`biasMatrix`.
 */
export default function NullModelCard({
	model,
	groups,
	label,
	blurb,
	why,
}: {
	model: TapeNullModel;
	groups: number[];
	label: string;
	blurb: string;
	why: string;
}) {
	const n = groups.length;
	const drawSeed = useMemo(
		() => seedFor("matching:against-chance:null-draw", model),
		[model],
	);
	const matrixSeed = useMemo(
		() => seedFor("matching:against-chance:null-matrix", model),
		[model],
	);
	const perm = useMemo(
		() => nullPerm(model, groups, mulberry32(drawSeed)),
		[model, groups, drawSeed],
	);
	const matrix = useMemo(
		() => biasMatrix(n, model, groups, DRAWS, matrixSeed),
		[n, model, groups, matrixSeed],
	);
	const cell = Math.max(5, Math.min(12, Math.floor(260 / Math.max(1, n))));

	return (
		<div className="ac-null-card">
			<h3>{label}</h3>
			<p className="prose">{blurb}</p>
			<div className="ac-null-figs">
				<figure className="story-figure ac-null-fig">
					<OriginStrip n={n} perm={perm} cellSize={Math.max(10, cell)} />
					<figcaption>
						One draw: each tile keeps the colour of the cord that started there.
					</figcaption>
				</figure>
				<figure className="story-figure ac-null-fig">
					<BiasMatrix matrix={matrix} n={n} cellSize={cell} />
					<figcaption>
						{DRAWS} draws: row = original position, column = where it landed;
						brighter means more often.
					</figcaption>
				</figure>
			</div>
			<p className="muted ac-why">{why}</p>
		</div>
	);
}
