import { useMemo, useState } from "react";
import { Legend } from "#/components/story/Story";
import { type TapeCord, tapeX } from "#/lib/matching/tape";
import type { PendantSum } from "#/lib/stories/chance";

export interface SumArcsProps {
	cords: TapeCord[];
	sums: PendantSum[];
}

type Filter = "both" | "right" | "left";

interface Marked extends PendantSum {
	id: number;
}

const TILE = 9;
const GROUP_GAP = 6;
const LANE_H = 46;

/**
 * Every pendant–pendant sum on one khipu, drawn as a bracket over the tape:
 * right-handed (the run it totals lies to the sum cord's right, so the
 * target reads to the left of its parts) arcs above the line, left-handed
 * arcs below. With well over a hundred of them
 * on a sum-rich khipu, the point is density as much as any one arc — this is
 * what "sums are everywhere" looks like before it is checked against
 * chance (chapter 5). Source: src/lib/stories/chance.ts's `pendantSums`,
 * run through src/lib/matching/sumTrace.ts.
 */
export default function SumArcs({ cords, sums }: SumArcsProps) {
	const [filter, setFilter] = useState<Filter>("both");
	const [hover, setHover] = useState<number | null>(null);

	const marked = useMemo<Marked[]>(
		() => sums.map((s, id) => ({ ...s, id })),
		[sums],
	);
	const xs = useMemo(
		() => tapeX(cords, { tile: TILE, groupGap: GROUP_GAP }),
		[cords],
	);
	const width = xs.length ? xs[xs.length - 1] + TILE : 0;
	const axisY = LANE_H + 4;
	const height = axisY * 2 + 14;
	const cx = (i: number) => (xs[i] ?? 0) + TILE / 2;

	const right = marked.filter((s) => s.right);
	const left = marked.filter((s) => !s.right);
	const shown = filter === "both" ? marked : filter === "right" ? right : left;

	const groupTicks = useMemo(() => {
		const out: number[] = [];
		for (let i = 1; i < cords.length; i++)
			if (cords[i].group !== cords[i - 1].group)
				out.push(xs[i] - GROUP_GAP / 2);
		return out;
	}, [cords, xs]);

	const arc = (s: Marked) => {
		const lo = Math.min(s.from, s.at);
		const hi = Math.max(s.to, s.at);
		const x1 = cx(lo);
		const x2 = cx(hi);
		const h = Math.min(LANE_H - 4, 8 + Math.sqrt(Math.max(1, x2 - x1)) * 3.4);
		const yc = s.right ? axisY - h : axisY + h;
		return `M ${x1} ${axisY} Q ${(x1 + x2) / 2} ${yc} ${x2} ${axisY}`;
	};

	const hovered = hover != null ? marked[hover] : null;

	return (
		<div className="sum-arcs">
			<div className="diagram-tools">
				<span>
					<strong>{marked.length}</strong> sums found on the khipu
				</span>
				<span className="spacer" />
				<button
					type="button"
					className="btn"
					aria-pressed={filter === "both"}
					onClick={() => setFilter("both")}
				>
					both
				</button>
				<button
					type="button"
					className="btn"
					aria-pressed={filter === "right"}
					onClick={() => setFilter("right")}
				>
					right-handed ({right.length})
				</button>
				<button
					type="button"
					className="btn"
					aria-pressed={filter === "left"}
					onClick={() => setFilter("left")}
				>
					left-handed ({left.length})
				</button>
			</div>
			<div className="mtx-scroll">
				<svg
					className="sum-arcs-svg"
					width={width}
					height={height}
					viewBox={`0 0 ${width} ${height}`}
					role="img"
					aria-label={`${marked.length} pendant-pendant sums over ${cords.length} cords; ${right.length} right-handed above the line, ${left.length} left-handed below`}
					onPointerLeave={() => setHover(null)}
				>
					{groupTicks.map((x) => (
						<line
							key={x}
							x1={x}
							x2={x}
							y1={axisY - LANE_H}
							y2={axisY + LANE_H}
							className="sum-arcs-grouptick"
						/>
					))}
					<line
						x1={0}
						x2={width}
						y1={axisY}
						y2={axisY}
						className="sum-arcs-axis"
					/>
					{shown.map((s) => (
						<path
							key={s.id}
							d={arc(s)}
							className={`sum-arc ${s.right ? "sum-arc-right" : "sum-arc-left"}${hover === s.id ? " is-hover" : ""}`}
							onPointerEnter={() => setHover(s.id)}
						/>
					))}
					{shown.map((s) => (
						<circle
							key={`${s.id}-mark`}
							cx={cx(s.at)}
							cy={axisY}
							r={hover === s.id ? 3.2 : 2}
							className={`sum-arc-mark ${s.right ? "sum-arc-mark-right" : "sum-arc-mark-left"}`}
						/>
					))}
				</svg>
			</div>
			<Legend
				items={[
					{
						color: "var(--hand-r)",
						label: "right-handed: target left of its parts",
					},
					{
						color: "var(--hand-l)",
						label: "left-handed: target right of its parts",
					},
				]}
			/>
			<p className="sum-arcs-caption" aria-live="polite">
				{hovered ? (
					<>
						Cord {cords[hovered.at]?.name} ({cords[hovered.at]?.value}) ={" "}
						{cords
							.slice(hovered.from, hovered.to + 1)
							.map((c) => c.value)
							.join(" + ")}
						, cords {cords[hovered.from]?.name}–{cords[hovered.to]?.name}.
					</>
				) : (
					"Hover an arc for the cords it adds up."
				)}
			</p>
			<p className="muted">
				Source: src/lib/stories/chance.ts (pendantSums),
				src/lib/matching/sumTrace.ts
			</p>
		</div>
	);
}
