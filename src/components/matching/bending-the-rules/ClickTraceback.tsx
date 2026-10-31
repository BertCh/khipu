import { useMemo, useState } from "react";
import DpGrid from "#/components/matching/DpGrid";
import type { Khipu } from "#/lib/khipu/types";
import { swTrace, traceFrom } from "#/lib/matching/swTrace";
import { valuesOf } from "#/lib/matching/tape";
import DiffReading from "./DiffReading";

export interface ClickTracebackProps {
	k303: Khipu;
	k304: Khipu;
	ic: (v: number) => number;
}

/**
 * The same grid, fully filled; click any cell to see the best local path
 * ending there, not only the overall best. Source: src/lib/matching/swTrace.ts
 * (`traceFrom`).
 */
export default function ClickTraceback({
	k303,
	k304,
	ic,
}: ClickTracebackProps) {
	const result = useMemo(
		() => swTrace(valuesOf(k303), valuesOf(k304), ic),
		[k303, k304, ic],
	);
	const [cell, setCell] = useState<{ i: number; j: number } | null>(null);
	const path = useMemo(
		() => (cell ? traceFrom(result, ic, cell.i, cell.j) : result.path),
		[result, ic, cell],
	);
	const w = result.m + 1;
	const score = cell ? result.H[cell.i * w + cell.j] : result.best.score;

	return (
		<div className="btr-click">
			<DpGrid
				result={result}
				path={path}
				onCell={(i, j) => setCell({ i, j })}
				cellSize={24}
			/>
			<p className="btr-click-readout" aria-live="polite">
				{cell ? (
					<>
						Path ending at cord {cell.i} of KH0303, cord {cell.j} of KH0304:
						score <strong>{score.toFixed(1)}</strong>, {path.length} steps.{" "}
						<button type="button" className="btn" onClick={() => setCell(null)}>
							back to the best cell
						</button>
					</>
				) : (
					<>
						Showing the best local path: score{" "}
						<strong>{score.toFixed(1)}</strong>, {path.length} steps. Click any
						cell above to trace back from there instead.
					</>
				)}
			</p>
			<DiffReading
				a={result.a}
				b={result.b}
				path={path}
				aLabel="KH0303"
				bLabel="KH0304"
			/>
		</div>
	);
}
