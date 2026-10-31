import { useMemo } from "react";
import type { Placement, Unit } from "#/lib/stories/basel";

const PX_PER_CORD = 7;
const GAP = 5;
const BLOCK_H = 30;
const TOP_Y = 26;
const BOTTOM_Y = 150;

interface Block {
	unit: Unit;
	x: number;
	w: number;
}

function layout(units: Unit[]): Block[] {
	let x = 0;
	return units.map((unit) => {
		const w = Math.max(18, unit.cords.length * PX_PER_CORD);
		const b = { unit, x, w };
		x += w + GAP;
		return b;
	});
}

function mid(b: Block | undefined): number {
	return b ? b.x + b.w / 2 : 0;
}

/** one-sided fragments get a small flag instead of a full ribbon */
interface Flag {
	id: string;
	alias: string;
	k: number;
	row: "white" | "brown";
	firm: boolean;
}

/**
 * KH0147's ten-cord groups read from their start, against KH0450's big
 * groups read from their end: two rows of blocks in each khipu's own
 * recorded, left-to-right order, joined by ribbons where a Basel fragment
 * places the same unit number on both. Because KH0450 is numbered backwards
 * from the other end, a true match crosses.
 */
export default function BaselRibbonsFigure({
	white,
	brown,
	placements,
}: {
	white: Unit[];
	brown: Unit[];
	placements: Placement[];
}) {
	const whiteBlocks = useMemo(() => layout(white), [white]);
	const brownBlocks = useMemo(() => layout(brown), [brown]);
	const whiteByK = useMemo(
		() => new Map(whiteBlocks.map((b) => [b.unit.k, b])),
		[whiteBlocks],
	);
	const brownByK = useMemo(
		() => new Map(brownBlocks.map((b) => [b.unit.k, b])),
		[brownBlocks],
	);

	const ribbons = placements
		.filter((p) => p.ruleHolds && p.brown && p.white)
		.map((p) => {
			const k = p.white?.unit.k as number;
			const wb = whiteByK.get(k);
			const bb = brownByK.get(k);
			const x0 = mid(wb);
			const x1 = mid(bb);
			const ym = (TOP_Y + BLOCK_H + BOTTOM_Y) / 2;
			return {
				id: p.id,
				alias: p.alias,
				k,
				d: `M${x0},${TOP_Y + BLOCK_H}C${x0},${ym} ${x1},${ym} ${x1},${BOTTOM_Y}`,
			};
		});

	const flags: Flag[] = placements.flatMap((p) => {
		const out: Flag[] = [];
		if (p.white && !(p.brown && p.ruleHolds))
			out.push({
				id: p.id,
				alias: p.alias,
				k: p.white.unit.k,
				row: "white",
				firm: p.white.run.firm,
			});
		if (p.brown && !(p.white && p.ruleHolds))
			out.push({
				id: p.id,
				alias: p.alias,
				k: p.brown.unit.k,
				row: "brown",
				firm: p.brown.run.firm,
			});
		return out;
	});

	const extent = (blocks: Block[]) => {
		const last = blocks.at(-1);
		return last ? last.x + last.w : 0;
	};
	const width = Math.max(extent(whiteBlocks), extent(brownBlocks));

	return (
		<div className="mtx-scroll">
			<svg
				className="basel-ribbons"
				width={width + 8}
				height={BOTTOM_Y + BLOCK_H + 20}
				viewBox={`0 0 ${width + 8} ${BOTTOM_Y + BLOCK_H + 20}`}
				role="img"
				aria-label={`${ribbons.length} fragments placed on both KH0147 and KH0450 at the same unit number, of ${white.length} units each`}
			>
				<text className="basel-row-label" x={0} y={14}>
					KH0147 (AS131), ten-cord groups, start to end →
				</text>
				{whiteBlocks.map((b) => (
					<g key={`w${b.unit.group}`} className="basel-block basel-block-white">
						<rect x={b.x} y={TOP_Y} width={b.w} height={BLOCK_H} rx={3} />
						<text x={mid(b)} y={TOP_Y + BLOCK_H / 2 + 4}>
							{b.unit.k}
						</text>
						<title>
							unit {b.unit.k} (recorded group {b.unit.group + 1}),{" "}
							{b.unit.cords.length} cords
						</title>
					</g>
				))}
				{ribbons.map((r) => (
					<path key={r.id} className="basel-ribbon" d={r.d}>
						<title>
							{r.alias}: placed at unit {r.k} on both halves
						</title>
					</path>
				))}
				{flags
					.filter((f) => f.row === "white")
					.map((f) => (
						<circle
							key={f.id}
							className={`basel-flag${f.firm ? "" : " is-weak"}`}
							cx={mid(whiteByK.get(f.k))}
							cy={TOP_Y + BLOCK_H + 5}
							r={3}
						>
							<title>
								{f.alias}: white half only, unit {f.k}
								{f.firm ? "" : " (probable)"}
							</title>
						</circle>
					))}
				{flags
					.filter((f) => f.row === "brown")
					.map((f) => (
						<circle
							key={f.id}
							className={`basel-flag${f.firm ? "" : " is-weak"}`}
							cx={mid(brownByK.get(f.k))}
							cy={BOTTOM_Y - 5}
							r={3}
						>
							<title>
								{f.alias}: brown half only, unit {f.k}
								{f.firm ? "" : " (probable)"}
							</title>
						</circle>
					))}
				{brownBlocks.map((b) => (
					<g key={`b${b.unit.group}`} className="basel-block basel-block-brown">
						<rect x={b.x} y={BOTTOM_Y} width={b.w} height={BLOCK_H} rx={3} />
						<text x={mid(b)} y={BOTTOM_Y + BLOCK_H / 2 + 4}>
							{b.unit.k}
						</text>
						<title>
							unit {b.unit.k} (recorded group {b.unit.group + 1}),{" "}
							{b.unit.cords.length} cords
						</title>
					</g>
				))}
				<text className="basel-row-label" x={0} y={BOTTOM_Y + BLOCK_H + 16}>
					KH0450 (UR212), big groups in recorded order, numbered from its end →
				</text>
			</svg>
		</div>
	);
}
