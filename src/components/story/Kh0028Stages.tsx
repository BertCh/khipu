import type { FitCell } from "#/lib/stories/kh0028";
import { halfPositions } from "#/lib/stories/kh0028";

/**
 * The template figure of the proportional-template story: each nine- or
 * ten-cord series of KH0028 as a row of bars, every bar the value divided by
 * the row's N, so rows that share the shape line up whatever their scale and
 * the ones that do not show where they break. The half positions are drawn
 * in the accent colour; a bar that misses its expected height gets a rule at
 * the height it should have reached. Used twice: for the pendant groups and
 * for the subsidiary series under them.
 */

export interface StripRow {
	key: string;
	label: string;
	sub: string;
	n: number;
	N: number;
	cells: FitCell[];
	right: string;
	rightSub?: string;
}

const CELL = 34;
const ROW = 50;
const BAR_MAX = 26;
const LABEL_W = 196;
const RIGHT_W = 84;
const PAD = 12;

export function TemplateStrip({
	rows,
	title,
}: {
	rows: StripRow[];
	title: string;
}) {
	const cols = Math.max(...rows.map((r) => r.n), 10);
	const width = PAD + LABEL_W + cols * CELL + RIGHT_W + PAD;
	const height = PAD + 16 + rows.length * ROW + PAD;
	const x0 = PAD + LABEL_W;
	return (
		<div className="pt-strip">
			<svg
				width={width}
				height={height}
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label={title}
				style={{ display: "block", minWidth: width }}
			>
				<title>{title}</title>
				{Array.from({ length: cols }, (_, i) => i + 1).map((pos) => (
					<text
						key={pos}
						x={x0 + (pos - 0.5) * CELL}
						y={PAD + 8}
						textAnchor="middle"
						fill={
							halfPositions(10).includes(pos) ? "var(--accent)" : "var(--ink-3)"
						}
						fontSize={9}
						fontVariant="tabular-nums"
					>
						{pos}
					</text>
				))}
				{rows.map((r, ri) => {
					const top = PAD + 16 + ri * ROW;
					const base = top + 6 + BAR_MAX;
					const halves = halfPositions(r.n);
					return (
						<g key={r.key}>
							<line
								x1={x0}
								x2={x0 + r.n * CELL}
								y1={base + 0.5}
								y2={base + 0.5}
								stroke="var(--rule)"
								strokeWidth={1}
							/>
							<text
								x={PAD}
								y={base - 8}
								fill="var(--ink)"
								fontSize={11}
								fontVariant="tabular-nums"
							>
								{r.label}
							</text>
							<text x={PAD} y={base + 5} fill="var(--ink-3)" fontSize={9}>
								{r.sub}
							</text>
							{r.cells.map((c) => {
								const cx = x0 + (c.pos - 0.5) * CELL;
								const w = 18;
								const wantH = (c.want / r.N) * BAR_MAX;
								if (c.cls === "absent") {
									return (
										<text
											key={c.pos}
											x={cx}
											y={base + 12}
											textAnchor="middle"
											fill="var(--ink-3)"
											fontSize={9}
										>
											·
										</text>
									);
								}
								if (c.value === null) {
									return (
										<g key={c.pos}>
											<rect
												x={cx - w / 2}
												y={base - wantH}
												width={w}
												height={wantH}
												fill="none"
												stroke="var(--ink-3)"
												strokeDasharray="2 2"
												strokeWidth={1}
											/>
											<text
												x={cx}
												y={base + 12}
												textAnchor="middle"
												fill="var(--ink-3)"
												fontSize={9}
											>
												—
											</text>
										</g>
									);
								}
								const ratio = c.value / r.N;
								const h = Math.max(1, Math.min(1.25, ratio) * BAR_MAX);
								const off = c.cls === "mismatch";
								const rounded = c.cls === "up" || c.cls === "down";
								const fill = halves.includes(c.pos)
									? "var(--accent)"
									: "var(--band-a)";
								return (
									<g key={c.pos}>
										<rect
											x={cx - w / 2}
											y={base - h}
											width={w}
											height={h}
											fill={fill}
											fillOpacity={c.value === 0 ? 0 : off ? 0.45 : 0.9}
											rx={1.5}
										/>
										{(off || rounded) && (
											<line
												x1={cx - w / 2 - 2}
												x2={cx + w / 2 + 2}
												y1={base - wantH}
												y2={base - wantH}
												stroke={off ? "var(--moiety-r)" : "var(--ink)"}
												strokeWidth={off ? 1.5 : 1}
												strokeDasharray={rounded ? "2 2" : undefined}
											/>
										)}
										<text
											x={cx}
											y={base + 12}
											textAnchor="middle"
											fill={off ? "var(--moiety-r)" : "var(--ink-2)"}
											fontSize={9}
											fontWeight={off ? 600 : 400}
											fontVariant="tabular-nums"
										>
											{c.value}
										</text>
									</g>
								);
							})}
							<text
								x={x0 + cols * CELL + 10}
								y={base - 8}
								fill="var(--ink)"
								fontSize={11}
								fontVariant="tabular-nums"
							>
								{r.right}
							</text>
							{r.rightSub && (
								<text
									x={x0 + cols * CELL + 10}
									y={base + 5}
									fill="var(--ink-3)"
									fontSize={9}
									fontVariant="tabular-nums"
								>
									{r.rightSub}
								</text>
							)}
						</g>
					);
				})}
			</svg>
		</div>
	);
}

/**
 * The magnitudes as a ladder: each fitting group's N as a bar, in cord order,
 * with its template total beside it. The one magnitude in no whole ratio
 * with the others is drawn in the contrast colour.
 */
export function MagnitudeLadder({
	items,
	title,
}: {
	items: {
		key: string;
		label: string;
		N: number;
		total: number | null;
		lone: boolean;
	}[];
	title: string;
}) {
	const maxN = Math.max(...items.map((i) => i.N));
	const barW = 260;
	const rowH = 30;
	const labelW = 110;
	const width = labelW + barW + 150;
	const height = items.length * rowH + 16;
	return (
		<div className="pt-strip">
			<svg
				width={width}
				height={height}
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label={title}
				style={{ display: "block", minWidth: width }}
			>
				<title>{title}</title>
				{items.map((it, i) => {
					const y = 8 + i * rowH;
					const w = (it.N / maxN) * barW;
					return (
						<g key={it.key}>
							<text x={0} y={y + 15} fill="var(--ink)" fontSize={11}>
								{it.label}
							</text>
							<rect
								x={labelW}
								y={y + 4}
								width={Math.max(2, w)}
								height={rowH - 12}
								rx={2}
								fill={it.lone ? "var(--moiety-r)" : "var(--band-a)"}
								fillOpacity={0.85}
							/>
							<text
								x={labelW + w + 6}
								y={y + 15}
								fill="var(--ink)"
								fontSize={11}
								fontVariant="tabular-nums"
							>
								N = {it.N}
								{it.total !== null && (
									<tspan fill="var(--ink-3)"> · Σ {it.total}</tspan>
								)}
							</text>
						</g>
					);
				})}
			</svg>
		</div>
	);
}
