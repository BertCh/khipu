import { hexFor, inkOn } from "#/lib/khipu/colors";
import type { ColorTable, Cord, Khipu } from "#/lib/khipu/types";
import {
	BLOCK,
	blockSpans,
	blocks,
	N_BLOCKS,
	subsOf,
	TAIL_GROUPS,
	TAIL_WIDTH_CM,
	TRIAD_GROUPS,
	TRIAD_WIDTH_CM,
	tailGroups,
	tailSpans,
} from "#/lib/stories/kh0135";

/**
 * Two figures for the KH0135 story. TemplateGrid lays the khipu out as the
 * recorders' structure implies: ten rows of seven triads on the left, ten
 * rows of seven single cords on the right, every cell in its recorded colour,
 * with the knotted cells ringed and their values written in. LayoutStrip
 * draws the same cords to scale along the primary cord, from the group
 * starts and the measured widths of a triad and a seven-cord group.
 */

const CELL = 15;
const GAP = 1;
const TRIAD_GAP = 7;
const ROW = CELL + 3;
const LABEL_W = 52;
const SECTION_GAP = 30;

export function TemplateGrid({
	khipu,
	colors,
}: {
	khipu: Khipu;
	colors: ColorTable;
}) {
	const bl = blocks(khipu);
	const tl = tailGroups(khipu);
	const kids = subsOf(khipu);
	const triadW = 3 * CELL + 2 * GAP;
	const leftW = BLOCK * triadW + (BLOCK - 1) * TRIAD_GAP;
	const rightX = LABEL_W + leftW + SECTION_GAP;
	const rightW = BLOCK * (CELL + GAP) - GAP;
	const top = 22;
	const width = rightX + rightW + 8;
	const height = top + N_BLOCKS * ROW + 6;

	const cell = (c: Cord, x: number, y: number, key: string) => {
		const hex = hexFor(c.colorParsed?.[0]?.codes[0], colors);
		const knotted = c.knots.length > 0;
		const subs = kids.get(c.name) ?? [];
		return (
			<g key={key}>
				<title>{`${c.name}: ${c.color ?? "?"}, value ${c.value ?? 0}${subs.length ? `, subsidiary ${subs.map((s) => `${s.name} ${s.value}`).join(", ")}` : ""}`}</title>
				<rect
					x={x}
					y={y}
					width={CELL}
					height={CELL}
					rx={2}
					fill={hex}
					stroke={knotted ? "var(--accent)" : "var(--rule)"}
					strokeWidth={knotted ? 1.5 : 0.5}
				/>
				{knotted && (
					<text
						x={x + CELL / 2}
						y={y + CELL / 2 + 0.5}
						textAnchor="middle"
						dominantBaseline="middle"
						fontSize={8}
						fontWeight={600}
						fill={inkOn(hex)}
					>
						{c.value}
					</text>
				)}
				{subs.length > 0 && (
					<circle
						cx={x + CELL - 1}
						cy={y + CELL - 1}
						r={2.6}
						fill="var(--moiety-r)"
						stroke="var(--surface)"
						strokeWidth={1}
					/>
				)}
			</g>
		);
	};

	return (
		<div className="figure" style={{ overflowX: "auto" }}>
			<svg
				width="100%"
				style={{ minWidth: 560, display: "block" }}
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label={`${khipu.id} as a grid: ${N_BLOCKS} blocks of ${BLOCK} triads and ${N_BLOCKS} groups of ${BLOCK} cords, knotted cells marked`}
			>
				<title>{khipu.id} as a grid</title>
				<text x={LABEL_W} y={12} className="kd-label">
					Blocks of seven triads · groups {TRIAD_GROUPS[0] + 1}–
					{TRIAD_GROUPS[TRIAD_GROUPS.length - 1] + 1}
				</text>
				<text x={rightX} y={12} className="kd-label">
					Seven-cord groups · {TAIL_GROUPS[0] + 1}–
					{TAIL_GROUPS[TAIL_GROUPS.length - 1] + 1}
				</text>
				{bl.map((block, b) => {
					const y = top + b * ROW;
					const first = block[0]?.[0]?.name ?? `block-${b + 1}`;
					return (
						<g key={first}>
							<text
								x={LABEL_W - 8}
								y={y + CELL / 2}
								className="kd-label"
								textAnchor="end"
								dominantBaseline="middle"
							>
								{b + 1}
							</text>
							{block.map((triad, t) =>
								triad.map((c, p) =>
									cell(
										c,
										LABEL_W + t * (triadW + TRIAD_GAP) + p * (CELL + GAP),
										y,
										c.name,
									),
								),
							)}
							{tl[b]?.map((c, p) =>
								cell(c, rightX + p * (CELL + GAP), y, c.name),
							)}
						</g>
					);
				})}
			</svg>
		</div>
	);
}

/**
 * The khipu to scale along its primary cord: each cord a hairline in its
 * recorded colour at its metric position, blocks banded and numbered, the
 * gaps between them written in, knots as dots at their recorded distance
 * down the cord. Cord lengths are not to scale (most were not recorded).
 * The primary cord is drawn neutral: its colour was not recorded by the
 * Aschers, and the "W" in the data file is unsupported.
 */
export function LayoutStrip({
	khipu,
	colors,
}: {
	khipu: Khipu;
	colors: ColorTable;
}) {
	const W = 960;
	const H = 156;
	const PAD = 26;
	const primaryY = 46;
	const hang = 56;
	const pxPerCmDown = 1.7;
	const len = khipu.primary.length ?? 1;
	const sx = (cm: number) => PAD + (cm / len) * (W - 2 * PAD);
	const bs = blockSpans(khipu);
	const ts = tailSpans(khipu);
	const bl = blocks(khipu);
	const tl = tailGroups(khipu);
	const kids = subsOf(khipu);

	const cordLine = (c: Cord, x: number, key: string) => {
		const hex = hexFor(c.colorParsed?.[0]?.codes[0], colors);
		return (
			<g key={key}>
				<line
					x1={x}
					x2={x}
					y1={primaryY}
					y2={primaryY + hang}
					stroke="var(--cord-casing)"
					strokeWidth={1.4}
				/>
				<line
					x1={x}
					x2={x}
					y1={primaryY}
					y2={primaryY + hang}
					stroke={hex}
					strokeWidth={0.8}
				/>
			</g>
		);
	};
	const knotDots = (c: Cord, x: number) =>
		c.knots.map((k, i) => (
			<circle
				// biome-ignore lint/suspicious/noArrayIndexKey: positional
				key={`${c.name}-${i}`}
				cx={x}
				cy={primaryY + k.pos * pxPerCmDown}
				r={1.6}
				fill="var(--accent)"
			/>
		));

	const ticks: number[] = [];
	for (let cm = 0; cm <= len; cm += 20) ticks.push(cm);

	return (
		<div className="figure" style={{ overflowX: "auto" }}>
			<svg
				width="100%"
				style={{ minWidth: 760, display: "block" }}
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label={`${khipu.id} to scale along its ${len} cm primary cord`}
			>
				<title>{khipu.id} along the primary cord</title>
				{/* block bands */}
				{bs.map((s) => (
					<rect
						key={`band-${s.n}`}
						x={sx(s.start) - 1.5}
						y={primaryY - 16}
						width={sx(s.end) - sx(s.start) + 3}
						height={hang + 24}
						rx={3}
						fill="var(--band-b)"
						opacity={0.35}
					/>
				))}
				{/* primary cord */}
				<line
					x1={sx(0)}
					x2={sx(len)}
					y1={primaryY}
					y2={primaryY}
					stroke="var(--cord-casing)"
					strokeWidth={4}
					strokeLinecap="round"
				/>
				<line
					x1={sx(0)}
					x2={sx(len)}
					y1={primaryY}
					y2={primaryY}
					stroke="var(--band-a)"
					strokeWidth={2.5}
					strokeLinecap="round"
				/>
				{/* scale */}
				{ticks.map((cm) => (
					<g key={`tick-${cm}`}>
						<line
							x1={sx(cm)}
							x2={sx(cm)}
							y1={H - 26}
							y2={H - 22}
							stroke="var(--rule)"
						/>
						<text
							x={sx(cm)}
							y={H - 12}
							className="kd-label"
							textAnchor="middle"
						>
							{cm}
						</text>
					</g>
				))}
				<text x={sx(len)} y={H - 2} className="kd-label" textAnchor="end">
					cm along the primary cord
				</text>
				{/* triad cords */}
				{bl.map((block, b) =>
					block.map((triad, t) => {
						const gi = TRIAD_GROUPS[b * BLOCK + t];
						const start = khipu.groups[gi].start;
						return triad.map((c, p) => {
							const x = sx(start + (p * TRIAD_WIDTH_CM) / (triad.length - 1));
							return (
								<g key={c.name}>
									{cordLine(c, x, c.name)}
									{knotDots(c, x)}
									{(kids.get(c.name) ?? []).map((s) => knotDots(s, x + 1.5))}
								</g>
							);
						});
					}),
				)}
				{/* tail cords */}
				{tl.map((group, j) => {
					const start = khipu.groups[TAIL_GROUPS[j]].start;
					return group.map((c, p) => {
						const x = sx(start + (p * TAIL_WIDTH_CM) / (group.length - 1));
						return (
							<g key={c.name}>
								{cordLine(c, x, c.name)}
								{knotDots(c, x)}
							</g>
						);
					});
				})}
				{/* block numbers and gaps */}
				{bs.map((s, i) => (
					<g key={`label-${s.n}`}>
						<text
							x={(sx(s.start) + sx(s.end)) / 2}
							y={primaryY - 22}
							className="kd-label"
							textAnchor="middle"
						>
							{s.n}
						</text>
						{s.gapAfter != null && i + 1 < bs.length && (
							<text
								x={(sx(s.end) + sx(bs[i + 1].start)) / 2}
								y={primaryY + hang + 22}
								className="kd-label"
								textAnchor="middle"
							>
								{s.gapAfter}
							</text>
						)}
					</g>
				))}
				{/* the empty stretch */}
				{bs.at(-1)?.gapAfter != null && (
					<g>
						<line
							x1={sx(bs[bs.length - 1].end) + 2}
							x2={sx(ts[0].start) - 2}
							y1={primaryY + hang + 14}
							y2={primaryY + hang + 14}
							stroke="var(--rule)"
							strokeDasharray="2 3"
						/>
						<text
							x={(sx(bs[bs.length - 1].end) + sx(ts[0].start)) / 2}
							y={primaryY + hang + 26}
							className="kd-label"
							textAnchor="middle"
						>
							{bs[bs.length - 1].gapAfter} cm empty
						</text>
					</g>
				)}
				{/* tail group numbers */}
				{ts.map((s) => (
					<text
						key={`tail-${s.n}`}
						x={(sx(s.start) + sx(s.end)) / 2}
						y={primaryY - 22}
						className="kd-label"
						textAnchor="middle"
					>
						{s.n}
					</text>
				))}
				<text
					x={(sx(bs[0].start) + sx(bs[bs.length - 1].end)) / 2}
					y={primaryY - 34}
					className="kd-label"
					textAnchor="middle"
				>
					ten blocks of seven triads
				</text>
				<text
					x={(sx(ts[0].start) + sx(ts[ts.length - 1].end)) / 2}
					y={primaryY - 34}
					className="kd-label"
					textAnchor="middle"
				>
					ten groups of seven
				</text>
			</svg>
		</div>
	);
}
