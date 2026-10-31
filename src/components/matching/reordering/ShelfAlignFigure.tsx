import { TracePlayer } from "#/components/matching/TracePlayer";
import { useTrace } from "#/components/matching/useTrace";

export interface AlignRow {
	id: string;
	alias: string;
	/** level-1 cord count */
	n: number;
	/** alignRows' computed shift, in cords */
	offset: number;
	/** cord ranges [from, to) this row's matched piece covers */
	highlights: [number, number][];
}

const PITCH = 3;
const BAR_H = 22;
const ROW_GAP = 34;
const MARGIN = 4;
/** room above the first row for its label, so it isn't clipped by the viewBox */
const TOP = 20;

/**
 * Three rows of one Berlin island, slid sideways by the real weighted-median
 * offsets `alignRows` computes (src/components/story/IslandShelf.tsx), so
 * UR233's cords sit under the part of AS175 it restates, and UR232's under
 * the other part — the same mechanism the /network island shelf uses to lay
 * a whole island out.
 */
export default function ShelfAlignFigure({ rows }: { rows: AlignRow[] }) {
	const state = useTrace(2, { fps: 0.6, reducedStep: 1 });
	const aligned = state.step === 1;
	const maxExtent = Math.max(...rows.map((r) => r.offset + r.n));
	const width = MARGIN * 2 + maxExtent * PITCH;
	const height = TOP + rows.length * (BAR_H + ROW_GAP) - ROW_GAP + 8;

	return (
		<TracePlayer
			state={state}
			label="Alignment"
			caption={
				aligned ? (
					<>
						Slid into line: each row moved by the weighted median of where its
						matched cords land against its neighbour —{" "}
						{rows
							.map(
								(r) =>
									`${r.alias} ${r.offset >= 0 ? "+" : ""}${Math.round(r.offset)}`,
							)
							.join(", ")}{" "}
						cords.
					</>
				) : (
					<>
						All three rows start flush left, cord 1 over cord 1 — none of them
						actually line up.
					</>
				)
			}
		>
			<div className="mtx-scroll">
				<svg
					className="shelf-align"
					width={width}
					height={height}
					viewBox={`0 0 ${width} ${height}`}
					role="img"
					aria-label={`Three khipus ${aligned ? "aligned by their matched cords" : "flush left, unaligned"}`}
				>
					{rows.map((r, idx) => {
						const y = TOP + idx * (BAR_H + ROW_GAP);
						// the bar is always drawn at its aligned x; a translateX shifts
						// it flush left (back to 0) when unaligned, so the move between
						// steps is one CSS transform transition, not a jump in geometry
						const xAligned = MARGIN + r.offset * PITCH;
						const dx = aligned ? 0 : -r.offset * PITCH;
						return (
							<g key={r.id} className="shelf-align-row">
								<text className="shelf-align-label" x={MARGIN} y={y - 6}>
									{r.id} · {r.alias} ({r.n} cords)
								</text>
								<g
									className="shelf-align-shift"
									style={{ transform: `translateX(${dx}px)` }}
								>
									<rect
										className="shelf-align-bar"
										x={xAligned}
										y={y}
										width={r.n * PITCH}
										height={BAR_H}
										rx={3}
									/>
									{r.highlights.map(([from, to]) => (
										<rect
											key={`${from}-${to}`}
											className="shelf-align-hl"
											x={xAligned + from * PITCH}
											y={y}
											width={(to - from) * PITCH}
											height={BAR_H}
											rx={2}
										/>
									))}
								</g>
							</g>
						);
					})}
				</svg>
			</div>
		</TracePlayer>
	);
}
