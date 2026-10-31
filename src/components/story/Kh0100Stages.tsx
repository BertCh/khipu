import type { Cord } from "#/lib/khipu/types";
import { knotsText, sortedKnots } from "#/lib/stories/kh0100";

/**
 * Figures for the story "Knots that are not decimal" (KH0100). The knot map
 * lays every knotted cord out as a column and draws each knot at its recorded
 * height with a mark for its type, so the order of knot types down a cord —
 * the thing the Aschers counted nineteen of — can be read across the whole
 * khipu at once. The height strip lines up knot heights by the place the
 * workbook gave them, to show the registers overlap.
 */

const INK = "var(--ink)";
const ACCENT = "var(--accent)";
const RULE = "var(--rule)";

export const KNOT_MARKS: { color: string; label: string; outline?: boolean }[] =
	[
		{ color: INK, label: "single knots (dot, sized by count)" },
		{ color: ACCENT, label: "long knot (bar, length by turns)" },
		{ color: "var(--surface)", label: "figure-eight (ring)", outline: true },
	];

function knotTitle(c: Cord): string {
	return `${c.name} · ${knotsText(c)} · workbook value ${c.value ?? "—"}`;
}

/**
 * Every knotted cord as a column; knots at their cm from the attachment.
 * `band` tints a column's background, `mark` draws a short bar under it.
 */
export function KnotMap({
	cords,
	band,
	mark,
	maxCm = 48,
	title,
}: {
	cords: Cord[];
	band?: (c: Cord) => string | null | undefined;
	mark?: (c: Cord) => string | null | undefined;
	maxCm?: number;
	title: string;
}) {
	const colW = 9.5;
	const pxPerCm = 5;
	const padL = 36;
	const padR = 10;
	const padTop = 16;
	const padBottom = 28;
	const width = padL + cords.length * colW + padR;
	const height = padTop + maxCm * pxPerCm + padBottom;
	const y = (cm: number) => padTop + cm * pxPerCm;
	const ticks: number[] = [];
	for (let cm = 0; cm <= maxCm; cm += 10) ticks.push(cm);
	return (
		<div className="kh0100-scroll">
			<svg
				viewBox={`0 0 ${width} ${height}`}
				width="100%"
				style={{ minWidth: width * 0.8, display: "block" }}
				role="img"
				aria-label={title}
			>
				<title>{title}</title>
				{/* primary cord */}
				<line
					x1={padL - 6}
					x2={width - padR + 4}
					y1={y(0)}
					y2={y(0)}
					stroke="var(--ink-3)"
					strokeWidth={2}
				/>
				{ticks.map((cm) => (
					<g key={cm}>
						<line
							x1={padL - 4}
							x2={width - padR}
							y1={y(cm)}
							y2={y(cm)}
							stroke={RULE}
							strokeWidth={0.5}
							strokeDasharray={cm === 0 ? undefined : "2 3"}
						/>
						<text
							x={padL - 8}
							y={y(cm)}
							className="kd-label"
							textAnchor="end"
							dominantBaseline="middle"
						>
							{cm} cm
						</text>
					</g>
				))}
				{cords.map((c, i) => {
					const x = padL + i * colW + colW / 2;
					const tint = band?.(c);
					const m = mark?.(c);
					const len = Math.min(c.length ?? maxCm, maxCm);
					const labelled =
						c.level === 1 && (c.ordinal === 1 || c.ordinal % 10 === 0);
					return (
						<g key={c.name}>
							<title>{knotTitle(c)}</title>
							{tint && (
								<rect
									x={x - colW / 2}
									y={padTop - 6}
									width={colW}
									height={maxCm * pxPerCm + 10}
									fill={tint}
									opacity={0.14}
								/>
							)}
							<line
								x1={x}
								x2={x}
								y1={y(0)}
								y2={y(len)}
								stroke={RULE}
								strokeWidth={c.level > 1 ? 0.8 : 1.1}
								strokeDasharray={c.level > 1 ? "3 2" : undefined}
							/>
							{sortedKnots(c).map((k, j) => {
								const ky = y(Math.min(k.pos, maxCm));
								if (k.type === "L") {
									const h = 2 + k.n * 1.2;
									return (
										<rect
											// biome-ignore lint/suspicious/noArrayIndexKey: positional
											key={j}
											x={x - 2.2}
											y={ky}
											width={4.4}
											height={h}
											rx={1.4}
											fill={ACCENT}
										/>
									);
								}
								if (k.type === "E") {
									return (
										<circle
											// biome-ignore lint/suspicious/noArrayIndexKey: positional
											key={j}
											cx={x}
											cy={ky}
											r={3}
											fill="var(--surface)"
											stroke={INK}
											strokeWidth={1.6}
										/>
									);
								}
								return (
									<circle
										// biome-ignore lint/suspicious/noArrayIndexKey: positional
										key={j}
										cx={x}
										cy={ky}
										r={1.7 + k.n * 0.45}
										fill={INK}
									/>
								);
							})}
							{m && (
								<rect
									x={x - colW / 2 + 1}
									y={y(maxCm) + 4}
									width={colW - 2}
									height={3}
									rx={1}
									fill={m}
								/>
							)}
							{labelled && (
								<text
									x={x}
									y={y(maxCm) + 18}
									className="kd-label"
									textAnchor="middle"
								>
									{c.name}
								</text>
							)}
						</g>
					);
				})}
			</svg>
		</div>
	);
}

export interface StripRow {
	label: string;
	heights: number[];
	color?: string;
}

/** Knot heights as a dot strip per row, with the median marked. */
export function HeightStrip({
	rows,
	maxCm = 48,
	title,
}: {
	rows: StripRow[];
	maxCm?: number;
	title: string;
}) {
	const padL = 190;
	const padR = 16;
	const rowH = 30;
	const padTop = 22;
	const plotW = 560;
	const width = padL + plotW + padR;
	const height = padTop + rows.length * rowH + 8;
	const x = (cm: number) => padL + (cm / maxCm) * plotW;
	const ticks: number[] = [];
	for (let cm = 0; cm <= maxCm; cm += 10) ticks.push(cm);
	return (
		<div className="kh0100-scroll">
			<svg
				viewBox={`0 0 ${width} ${height}`}
				width="100%"
				style={{ minWidth: 560, display: "block" }}
				role="img"
				aria-label={title}
			>
				<title>{title}</title>
				{ticks.map((cm) => (
					<g key={cm}>
						<line
							x1={x(cm)}
							x2={x(cm)}
							y1={padTop - 6}
							y2={height - 6}
							stroke={RULE}
							strokeWidth={0.5}
							strokeDasharray="2 3"
						/>
						<text
							x={x(cm)}
							y={padTop - 10}
							className="kd-label"
							textAnchor="middle"
						>
							{cm} cm
						</text>
					</g>
				))}
				{rows.map((r, ri) => {
					const cy = padTop + ri * rowH + rowH / 2;
					const sorted = [...r.heights].sort((a, b) => a - b);
					const mid = sorted.length >> 1;
					const median =
						sorted.length === 0
							? null
							: sorted.length % 2
								? sorted[mid]
								: (sorted[mid - 1] + sorted[mid]) / 2;
					const color = r.color ?? INK;
					return (
						<g key={r.label}>
							<text
								x={padL - 12}
								y={cy}
								className="kd-label"
								style={{ fontSize: 10, fill: "var(--ink-2)" }}
								textAnchor="end"
								dominantBaseline="middle"
							>
								{r.label}
							</text>
							<line
								x1={padL}
								x2={padL + plotW}
								y1={cy}
								y2={cy}
								stroke={RULE}
								strokeWidth={0.6}
							/>
							{r.heights.map((h, i) => (
								<circle
									// biome-ignore lint/suspicious/noArrayIndexKey: positional
									key={i}
									cx={x(Math.min(h, maxCm))}
									cy={cy + ((i % 3) - 1) * 4}
									r={3.2}
									fill={color}
									fillOpacity={0.55}
								/>
							))}
							{median != null && (
								<line
									x1={x(median)}
									x2={x(median)}
									y1={cy - 11}
									y2={cy + 11}
									stroke={color}
									strokeWidth={2}
								/>
							)}
						</g>
					);
				})}
			</svg>
		</div>
	);
}
