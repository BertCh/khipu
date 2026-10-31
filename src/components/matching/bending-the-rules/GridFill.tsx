import { useMemo } from "react";
import DpGrid from "#/components/matching/DpGrid";
import { TracePlayer } from "#/components/matching/TracePlayer";
import { useTrace } from "#/components/matching/useTrace";
import type { Khipu } from "#/lib/khipu/types";
import { swTrace } from "#/lib/matching/swTrace";
import { valuesOf } from "#/lib/matching/tape";
import DiffReading from "./DiffReading";

export interface GridFillProps {
	k303: Khipu;
	k304: Khipu;
	ic: (v: number) => number;
}

/**
 * The Smith–Waterman–Gotoh grid filling row by row, then its traceback and
 * the alignment it found, read out as a diff. Source: src/lib/matching/swTrace.ts
 * (the fill order, `order`, matches align.ts's `swEncoded` cell for cell).
 */
export default function GridFill({ k303, k304, ic }: GridFillProps) {
	const result = useMemo(() => {
		const a = valuesOf(k303);
		const b = valuesOf(k304);
		return swTrace(a, b, ic);
	}, [k303, k304, ic]);

	const nCells = result.order.length;
	const ticks = useMemo(
		() =>
			Array.from(
				{ length: Math.max(0, result.n - 1) },
				(_, i) => (i + 1) * result.m,
			),
		[result.n, result.m],
	);
	const state = useTrace(nCells + 1, { fps: 40, reducedStep: nCells });
	const { step } = state;
	const done = step >= nCells;
	const row = done ? result.n : Math.max(1, Math.ceil(step / result.m));
	const caption = done
		? `Filled. Best local score ${result.best.score.toFixed(1)}, ending at cord ${result.best.i} of KH0303 against cord ${result.best.j} of KH0304.`
		: `Filling row ${row} of ${result.n}: cord ${row} of KH0303 (value ${result.a[row - 1]}) scored against every cord of KH0304.`;

	return (
		<div className="btr-grid-fill">
			<TracePlayer
				state={state}
				ticks={ticks}
				caption={caption}
				label="Alignment grid"
			>
				<DpGrid
					result={result}
					step={Math.min(step, nCells)}
					path={done ? undefined : null}
					cellSize={24}
				/>
			</TracePlayer>
			<div className={`btr-reading${done ? "" : " is-pending"}`}>
				{done ? (
					<DiffReading
						a={result.a}
						b={result.b}
						path={result.path}
						aLabel="KH0303"
						bLabel="KH0304"
					/>
				) : (
					<p className="muted">
						The reading below appears once the grid finishes filling.
					</p>
				)}
			</div>
		</div>
	);
}
