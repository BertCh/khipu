import { useMemo } from "react";
import { hexFor, paintsFor } from "#/lib/khipu/colors";
import { type CordSum, colorKey } from "#/lib/khipu/fieldmarks";
import type { ColorTable, Cord, KhipuLike } from "#/lib/khipu/types";
import { type XrayCell, xrayGrid } from "#/lib/khipu/xray";

/**
 * The Field Guide's x-ray of a khipu: one small square per level-1 cord, a
 * column per cord group, pendants hanging below the primary cord and top cords
 * standing above it. Squares carry the cord's colour; cords with no value are
 * hollow, since the sum search steps over them. Sum cords are outlined in
 * their hand's colour with an arrowhead on the side their summands lie. A sum
 * is drawn the way the Field Guide draws it: a dotted lead from the sum cord
 * to the near end of its run, then a thick thread through the summands in
 * order — so a run that steps over other cords is seen to do so. Hovering or
 * clicking a sum cord lights its thread and fades the rest of the khipu; the
 * page's readout below says what it adds up.
 */

const CELL = 11;
const GAP_X = 5;
const GAP_Y = 3;
const PAD = 14;
const LABEL_H = 14;
const COL = CELL + GAP_X;
const ROW = CELL + GAP_Y;

export const HAND_COLOR = { R: "var(--hand-r)", L: "var(--hand-l)" } as const;
export const HAND_LABEL = { R: "right-handed", L: "left-handed" } as const;

interface Props {
	khipu: KhipuLike;
	colors: ColorTable;
	/** the sums to draw (already filtered to the hands wanted) */
	sums: CordSum[];
	/** draw every sum's thread, not only the active one */
	showAll: boolean;
	/** pinned sum cord */
	focus: string | null;
	onFocus: (name: string | null) => void;
	/** hovered cord (any cell), shared with the readout and the table */
	hover: string | null;
	onHover: (name: string | null) => void;
}

interface Cell extends XrayCell {
	x: number;
	y: number;
}

/** The summands of a sum from the end nearest the sum cord outward. */
export function runOrder(s: CordSum): string[] {
	return s.hand === "R" ? s.summands : [...s.summands].reverse();
}

export default function SumXray({
	khipu,
	colors,
	sums,
	showAll,
	focus,
	onFocus,
	hover,
	onHover,
}: Props) {
	const grid = useMemo(() => {
		const g = xrayGrid(khipu);
		const primaryY = PAD + LABEL_H + g.rowsUp * ROW + (g.rowsUp > 0 ? 6 : 0);
		const cells = new Map<string, Cell>();
		for (const c of g.cells.values()) {
			const x = PAD + c.col * COL;
			const y =
				c.row >= 0
					? primaryY + 5 + c.row * ROW
					: primaryY - 5 - (-c.row - 1) * ROW - CELL;
			cells.set(c.cord.name, { ...c, x, y });
		}
		const dense = g.nCols > 60;
		const labels: { x: number; text: string }[] = [];
		g.groupOf.forEach((gi, ci) => {
			if (gi >= 0 && (!dense || ci === 0 || (gi + 1) % 5 === 0)) {
				labels.push({ x: PAD + ci * COL + CELL / 2, text: String(gi + 1) });
			}
		});
		return {
			cells,
			labels,
			primaryY,
			width: PAD * 2 + g.nCols * COL,
			height: primaryY + 5 + g.rowsDown * ROW + PAD,
			n: g.n,
		};
	}, [khipu]);

	const sumsByCord = useMemo(() => {
		const m = new Map<string, CordSum[]>();
		for (const s of sums) {
			const list = m.get(s.sum);
			if (list) list.push(s);
			else m.set(s.sum, [s]);
		}
		return m;
	}, [sums]);

	const active = hover ?? focus;
	const activeSums = active ? (sumsByCord.get(active) ?? []) : [];
	const lit = activeSums.length > 0;
	const involved = new Set<string>();
	for (const s of activeSums) {
		involved.add(s.sum);
		for (const n of s.summands) involved.add(n);
	}
	const primaryPaint = paintsFor(khipu.primary.colorParsed, colors)[0];
	const centre = (name: string) => {
		const c = grid.cells.get(name);
		return c ? { x: c.x + CELL / 2, y: c.y + CELL / 2 } : null;
	};

	return (
		<div className="sum-xray">
			<div className="khipu-scroll">
				<svg
					viewBox={`0 0 ${grid.width} ${grid.height}`}
					// small khipus grow to fill the width (up to 1.6×); wide ones
					// keep their natural size and scroll
					style={{
						width: "100%",
						minWidth: grid.width,
						maxWidth: grid.width * 1.6,
					}}
					role="img"
					aria-label={`X-ray of khipu ${khipu.id}: ${grid.n} cords in ${khipu.stats.nGroups} groups, ${sums.length} sum relationships`}
					onPointerLeave={() => onHover(null)}
				>
					<g className="kd-labels">
						{grid.labels.map((l) => (
							<text
								key={l.text}
								x={l.x}
								y={PAD + LABEL_H - 5}
								className="kd-label"
								textAnchor="middle"
							>
								{l.text}
							</text>
						))}
					</g>

					{/* primary cord */}
					<rect
						x={PAD - 6}
						y={grid.primaryY - 1.5}
						width={grid.width - 2 * PAD + 12}
						height={3}
						rx={1.5}
						fill={primaryPaint.base}
						stroke="var(--cord-casing)"
						strokeWidth={1}
					/>

					{/* cells */}
					<g className="xray-cells">
						{[...grid.cells.values()].map(({ cord, x, y }) => {
							const valued = !!cord.value && cord.value > 0;
							const paint = paintOf(cord, colors);
							const dim = lit && !involved.has(cord.name);
							const mine = sumsByCord.get(cord.name);
							const outline = mine
								? mine.length > 1
									? "var(--ink)"
									: HAND_COLOR[mine[0].hand]
								: valued
									? "var(--cord-casing)"
									: "var(--rule)";
							return (
								<g
									key={cord.name}
									className="kd-fade"
									style={{ opacity: dim ? 0.28 : 1 }}
								>
									{valued && (
										<rect
											x={x}
											y={y}
											width={CELL}
											height={CELL}
											rx={1.5}
											fill={paint.base}
										/>
									)}
									{valued && paint.accent && (
										<path
											d={`M${x + CELL},${y} v${CELL} h${-CELL} Z`}
											fill={paint.accent}
										/>
									)}
									<rect
										x={x}
										y={y}
										width={CELL}
										height={CELL}
										rx={1.5}
										fill="none"
										stroke={outline}
										strokeWidth={mine ? 1.6 : 1}
										strokeDasharray={valued ? undefined : "2 1.5"}
									/>
								</g>
							);
						})}
					</g>

					{/* every sum's thread, faint, when asked for */}
					{showAll && (
						<g className="xray-threads" pointerEvents="none">
							{sums.map((s) => {
								if (activeSums.includes(s)) return null;
								return (
									<Thread
										key={`${s.sum}-${s.hand}`}
										sum={s}
										centre={centre}
										weight={lit ? "faint" : "quiet"}
									/>
								);
							})}
						</g>
					)}

					{/* arrowheads on every sum cord, pointing at its summands */}
					<g className="xray-marks" pointerEvents="none">
						{sums.map((s) => {
							const c = grid.cells.get(s.sum);
							if (!c) return null;
							return (
								<path
									key={`${s.sum}-${s.hand}`}
									className="kd-fade"
									d={arrow(c, s.hand)}
									fill={HAND_COLOR[s.hand]}
									style={{ opacity: lit && !involved.has(s.sum) ? 0.25 : 1 }}
								/>
							);
						})}
					</g>

					{/* the lit sum: its thread, rings on its summands, a ring on the cord */}
					{lit && (
						<g className="xray-lit" pointerEvents="none">
							{activeSums.map((s) => (
								<Thread
									key={`${s.sum}-${s.hand}`}
									sum={s}
									centre={centre}
									weight="lit"
								/>
							))}
							<g fill="none">
								{activeSums.map((s) =>
									s.summands.map((n) => {
										const c = grid.cells.get(n);
										if (!c) return null;
										return (
											<rect
												key={`${s.hand}-${n}`}
												x={c.x - 1.5}
												y={c.y - 1.5}
												width={CELL + 3}
												height={CELL + 3}
												rx={2.5}
												stroke={HAND_COLOR[s.hand]}
												strokeWidth={1.6}
											/>
										);
									}),
								)}
								{(() => {
									const c = grid.cells.get(active as string);
									if (!c) return null;
									const stroke =
										activeSums.length > 1
											? "var(--ink)"
											: HAND_COLOR[activeSums[0].hand];
									return (
										<rect
											x={c.x - 2.5}
											y={c.y - 2.5}
											width={CELL + 5}
											height={CELL + 5}
											rx={3}
											stroke={stroke}
											strokeWidth={2.4}
										/>
									);
								})()}
							</g>
						</g>
					)}

					{/* hit targets */}
					<g className="xray-hits" fill="transparent">
						{[...grid.cells.values()].map(({ cord, x, y }) => (
							// biome-ignore lint/a11y/noStaticElementInteractions: SVG hit area; the sum table is the keyboard-reachable twin
							<rect
								key={cord.name}
								data-cord={cord.name}
								x={x - GAP_X / 2}
								y={y - GAP_Y / 2}
								width={COL}
								height={ROW}
								style={{
									cursor: sumsByCord.has(cord.name) ? "pointer" : "default",
								}}
								onPointerEnter={() => onHover(cord.name)}
								onClick={() => {
									if (!sumsByCord.has(cord.name)) return;
									onFocus(focus === cord.name ? null : cord.name);
								}}
							/>
						))}
					</g>
				</svg>
			</div>
		</div>
	);
}

/**
 * One sum as a path: a dotted lead from the sum cord to the nearest summand,
 * then a thick line threading the summands in run order.
 */
function Thread({
	sum,
	centre,
	weight,
}: {
	sum: CordSum;
	centre: (name: string) => { x: number; y: number } | null;
	weight: "lit" | "quiet" | "faint";
}) {
	const from = centre(sum.sum);
	const pts = runOrder(sum)
		.map(centre)
		.filter((p): p is { x: number; y: number } => p != null);
	if (!from || pts.length === 0) return null;
	const color = HAND_COLOR[sum.hand];
	const [width, opacity, leadOpacity] =
		weight === "lit"
			? [4.5, 0.5, 0.9]
			: weight === "quiet"
				? [2.5, 0.28, 0.45]
				: [2.5, 0.1, 0.15];
	return (
		<g
			className="kd-fade"
			stroke={color}
			fill="none"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<line
				x1={from.x}
				y1={from.y}
				x2={pts[0].x}
				y2={pts[0].y}
				strokeWidth={1.2}
				strokeOpacity={leadOpacity}
				strokeDasharray="1.5 3"
			/>
			<polyline
				points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
				strokeWidth={width}
				strokeOpacity={opacity}
			/>
			{/* a single summand has no run to thread: dot it */}
			{pts.length === 1 && (
				<circle
					cx={pts[0].x}
					cy={pts[0].y}
					r={width / 2}
					fill={color}
					fillOpacity={opacity}
					stroke="none"
				/>
			)}
		</g>
	);
}

/** The colour a cell is painted: a spliced cord shows the stretch the search keys it by. */
export function paintOf(cord: Cord, colors: ColorTable) {
	const paints = paintsFor(cord.colorParsed, colors);
	if (paints.length > 1 && paints.every((p) => p.range)) {
		const key = colorKey(cord);
		const codes = key?.split(/[:\-%^]/) ?? [];
		return {
			base: hexFor(codes[0], colors),
			accent: codes[1] ? hexFor(codes[1], colors) : undefined,
		};
	}
	return { base: paints[0].base, accent: paints[0].accent };
}

/** A small arrowhead just outside the cell, on the side the summands lie. */
function arrow(c: Cell, hand: "R" | "L"): string {
	const cy = c.y + CELL / 2;
	if (hand === "R") {
		const x = c.x + CELL + 1.5;
		return `M${x},${cy - 3.2} L${x + 4.5},${cy} L${x},${cy + 3.2} Z`;
	}
	const x = c.x - 1.5;
	return `M${x},${cy - 3.2} L${x - 4.5},${cy} L${x},${cy + 3.2} Z`;
}
