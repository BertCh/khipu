import type { Hist, RegisterPoint } from "#/lib/stories/registers";

/**
 * Figures for the "Counting to two" story (KH0034 and KH0670). ValueBars sets
 * the two khipus' pendant-value histograms side by side; RegisterPlot puts
 * every knot at its measured height against its cord's length, so a register
 * at a fixed distance from the primary cord shows as a horizontal band;
 * ValueGrid lays a khipu out as its template implies, one row per position
 * and one column per cycle or group, so structure by column or by row can be
 * seen before it is tested; ShareBars gives the knotted share by position.
 * All colours are the page's tokens, so the figures follow the theme.
 */

export interface BarSeries {
	label: string;
	colour: string;
	hist: Hist;
	/** denominator for the shares */
	n: number;
}

export function ValueBars({
	series,
	maxValue,
	title,
}: {
	series: BarSeries[];
	maxValue: number;
	title: string;
}) {
	const values = Array.from({ length: maxValue + 1 }, (_, i) => i);
	const slot = 84;
	const barW = 26;
	const padL = 40;
	const padT = 18;
	const plotH = 170;
	const width = padL + values.length * slot + 12;
	const height = padT + plotH + 34;
	const maxShare = Math.max(
		0.05,
		...series.flatMap((s) => values.map((v) => (s.hist.get(v) ?? 0) / s.n)),
	);
	const yOf = (share: number) => padT + plotH - (share / maxShare) * plotH;
	const ticks = [0, 0.25, 0.5].filter((t) => t <= maxShare + 0.01);
	return (
		<div className="ctt-scroll">
			<svg
				width={width}
				height={height}
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label={title}
				style={{ display: "block", minWidth: width }}
			>
				<title>{title}</title>
				{ticks.map((t) => (
					<g key={t}>
						<line
							x1={padL}
							x2={width - 8}
							y1={yOf(t)}
							y2={yOf(t)}
							stroke="var(--hairline)"
						/>
						<text
							x={padL - 6}
							y={yOf(t)}
							textAnchor="end"
							dominantBaseline="middle"
							fill="var(--ink-3)"
							fontSize={9}
						>
							{Math.round(t * 100)}%
						</text>
					</g>
				))}
				{values.map((v) => {
					const x0 = padL + v * slot;
					return (
						<g key={v}>
							{series.map((s, si) => {
								const n = s.hist.get(v) ?? 0;
								const share = n / s.n;
								const x =
									x0 +
									slot / 2 -
									(series.length * (barW + 3)) / 2 +
									si * (barW + 3);
								const y = yOf(share);
								return (
									<g key={s.label}>
										<title>{`${s.label}: value ${v}, ${n} of ${s.n} (${(100 * share).toFixed(1)}%)`}</title>
										<rect
											x={x}
											y={y}
											width={barW}
											height={Math.max(0, padT + plotH - y)}
											fill={s.colour}
											fillOpacity={0.9}
											rx={2}
										/>
										{n > 0 && (
											<text
												x={x + barW / 2}
												y={y - 3}
												textAnchor="middle"
												fill="var(--ink-2)"
												fontSize={9}
												fontVariant="tabular-nums"
											>
												{n}
											</text>
										)}
									</g>
								);
							})}
							<text
								x={x0 + slot / 2}
								y={padT + plotH + 14}
								textAnchor="middle"
								fill="var(--ink)"
								fontSize={11}
								fontVariant="tabular-nums"
							>
								{v}
							</text>
						</g>
					);
				})}
				<line
					x1={padL}
					x2={width - 8}
					y1={padT + plotH + 0.5}
					y2={padT + plotH + 0.5}
					stroke="var(--rule)"
				/>
				<text
					x={padL + (values.length * slot) / 2}
					y={height - 4}
					textAnchor="middle"
					fill="var(--ink-3)"
					fontSize={9}
				>
					pendant value, readable pendants
				</text>
			</svg>
		</div>
	);
}

export interface RegisterPanel {
	label: string;
	points: RegisterPoint[];
	/** the readability cut-off in cm */
	cut: number;
	mean: number;
	sd: number;
	colour: string;
}

/**
 * Knot height against cord length. Every knot is a point; the shaded band is
 * the register (mean ± one sd); the dashed vertical is the length below
 * which a blank broken cord is scored unknown; the diagonal is the cord's
 * end, which no knot can lie beyond.
 */
export function RegisterPlot({ panel }: { panel: RegisterPanel }) {
	const padL = 36;
	const padT = 10;
	const padB = 30;
	const plotW = 360;
	const plotH = 200;
	const maxLen = Math.max(20, ...panel.points.map((p) => p.length)) * 1.05;
	const maxH =
		Math.max(panel.cut + 4, ...panel.points.map((p) => p.height)) * 1.1;
	const xOf = (cm: number) => padL + (cm / maxLen) * plotW;
	const yOf = (cm: number) => padT + (cm / maxH) * plotH;
	const width = padL + plotW + 12;
	const height = padT + plotH + padB;
	const xt: number[] = [];
	for (let cm = 0; cm <= maxLen; cm += 10) xt.push(cm);
	const yt: number[] = [];
	for (let cm = 0; cm <= maxH; cm += 5) yt.push(cm);
	const diagEnd = Math.min(maxLen, maxH);
	return (
		<div className="ctt-scroll">
			<svg
				width={width}
				height={height}
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label={`${panel.label}: knot height against cord length`}
				style={{ display: "block", minWidth: width }}
			>
				<title>{panel.label}</title>
				{yt.map((cm) => (
					<g key={cm}>
						<line
							x1={padL}
							x2={padL + plotW}
							y1={yOf(cm)}
							y2={yOf(cm)}
							stroke="var(--hairline)"
						/>
						<text
							x={padL - 5}
							y={yOf(cm)}
							textAnchor="end"
							dominantBaseline="middle"
							fill="var(--ink-3)"
							fontSize={9}
						>
							{cm}
						</text>
					</g>
				))}
				{xt.map((cm) => (
					<text
						key={cm}
						x={xOf(cm)}
						y={padT + plotH + 12}
						textAnchor="middle"
						fill="var(--ink-3)"
						fontSize={9}
					>
						{cm}
					</text>
				))}
				<rect
					x={padL}
					y={yOf(panel.mean - panel.sd)}
					width={plotW}
					height={Math.max(
						1,
						yOf(panel.mean + panel.sd) - yOf(panel.mean - panel.sd),
					)}
					fill={panel.colour}
					fillOpacity={0.12}
				/>
				<line
					x1={padL}
					x2={padL + plotW}
					y1={yOf(panel.mean)}
					y2={yOf(panel.mean)}
					stroke={panel.colour}
					strokeWidth={1}
					strokeOpacity={0.6}
				/>
				<line
					x1={xOf(0)}
					x2={xOf(diagEnd)}
					y1={yOf(0)}
					y2={yOf(diagEnd)}
					stroke="var(--rule)"
					strokeWidth={1}
				/>
				<line
					x1={xOf(panel.cut)}
					x2={xOf(panel.cut)}
					y1={padT}
					y2={padT + plotH}
					stroke="var(--ink-3)"
					strokeDasharray="3 3"
				/>
				<text
					x={xOf(panel.cut) + 4}
					y={padT + plotH - 4}
					fill="var(--ink-3)"
					fontSize={9}
				>
					cut-off {panel.cut} cm
				</text>
				<text
					x={padL + 4}
					y={yOf(panel.mean + panel.sd) + 10}
					fill="var(--ink-2)"
					fontSize={9}
				>
					register {panel.mean.toFixed(1)} ± {panel.sd.toFixed(1)} cm
				</text>
				{panel.points.map((p, i) => (
					<circle
						// biome-ignore lint/suspicious/noArrayIndexKey: one point per knot, positional
						key={i}
						cx={xOf(p.length)}
						cy={yOf(p.height)}
						r={3.2}
						fill={panel.colour}
						fillOpacity={0.55}
						stroke="var(--surface)"
						strokeWidth={0.8}
					>
						<title>{`${p.name}: knot at ${p.height} cm on a ${p.length} cm cord, reads ${p.value}`}</title>
					</circle>
				))}
				<text
					x={padL + plotW / 2}
					y={height - 3}
					textAnchor="middle"
					fill="var(--ink-3)"
					fontSize={9}
				>
					cord length, cm →
				</text>
				<text
					x={9}
					y={padT + plotH / 2}
					textAnchor="middle"
					fill="var(--ink-3)"
					fontSize={9}
					transform={`rotate(-90 9 ${padT + plotH / 2})`}
				>
					knot height, cm ↓
				</text>
			</svg>
		</div>
	);
}

export interface GridCell {
	name: string;
	/** the value read, or null where the cord is unreadable */
	value: number | null;
	/** subsidiary values hanging from this cord */
	subs?: number[];
	recto?: boolean;
	off?: boolean;
	title?: string;
}

export interface GridColumn {
	label: string;
	cells: (GridCell | null)[];
	/** a rule is drawn before this column, with the label */
	partStart?: string;
}

const CELL = 16;
const GAP = 2;

/**
 * A khipu laid out by its template: rows are positions, columns are cycles or
 * groups. Fill deepens with the value; an unreadable cord is a dotted box; a
 * subsidiary is a dot under its cord; a recto cord is ringed.
 */
export function ValueGrid({
	rows,
	columns,
	colour,
	title,
	colSums,
}: {
	rows: { label: string; sub?: string }[];
	columns: GridColumn[];
	colour: string;
	title: string;
	colSums?: boolean;
}) {
	const labelW = 92;
	const top = 38;
	const step = CELL + GAP;
	const width = labelW + columns.length * step + 8;
	const height = top + rows.length * step + (colSums ? 22 : 8);
	const opacity = (v: number) =>
		v === 0 ? 0 : v === 1 ? 0.35 : v === 2 ? 0.6 : v <= 4 ? 0.82 : 1;
	return (
		<div className="ctt-scroll">
			<svg
				width={width}
				height={height}
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label={title}
				style={{ display: "block", minWidth: width }}
			>
				<title>{title}</title>
				{rows.map((r, ri) => (
					<g key={r.label}>
						<text
							x={labelW - 8}
							y={top + ri * step + CELL / 2}
							textAnchor="end"
							dominantBaseline="middle"
							fill="var(--ink)"
							fontSize={10}
							fontVariant="tabular-nums"
						>
							{r.label}
							{r.sub && (
								<tspan fill="var(--ink-3)" fontSize={8.5}>
									{" "}
									{r.sub}
								</tspan>
							)}
						</text>
					</g>
				))}
				{columns.map((col, ci) => {
					const x = labelW + ci * step;
					return (
						<g key={col.label}>
							{col.partStart && (
								<>
									<line
										x1={x - GAP / 2 - 0.5}
										x2={x - GAP / 2 - 0.5}
										y1={top - 16}
										y2={top + rows.length * step - GAP}
										stroke="var(--ink-3)"
										strokeWidth={1}
									/>
									<text x={x + 2} y={top - 22} fill="var(--ink-2)" fontSize={9}>
										{col.partStart}
									</text>
								</>
							)}
							{(ci % 5 === 4 || columns.length <= 12) && (
								<text
									x={x + CELL / 2}
									y={top - 5}
									textAnchor="middle"
									fill="var(--ink-3)"
									fontSize={8.5}
									fontVariant="tabular-nums"
								>
									{col.label}
								</text>
							)}
							{col.cells.map((cell, ri) => {
								const y = top + ri * step;
								const key = cell?.name ?? `${col.label}-${rows[ri]?.label}`;
								if (!cell) return null;
								if (cell.value === null)
									return (
										<g key={key}>
											<title>{cell.title ?? `${cell.name}: unreadable`}</title>
											<rect
												x={x + 0.5}
												y={y + 0.5}
												width={CELL - 1}
												height={CELL - 1}
												fill="none"
												stroke="var(--ink-3)"
												strokeDasharray="1.5 1.5"
												rx={2}
											/>
										</g>
									);
								return (
									<g key={key}>
										<title>{cell.title ?? `${cell.name}: ${cell.value}`}</title>
										<rect
											x={x}
											y={y}
											width={CELL}
											height={CELL}
											fill="var(--surface-2)"
											rx={2}
										/>
										<rect
											x={x}
											y={y}
											width={CELL}
											height={CELL}
											fill={colour}
											fillOpacity={opacity(cell.value)}
											stroke={
												cell.recto ? "var(--moiety-r)" : "var(--hairline)"
											}
											strokeWidth={cell.recto ? 1.6 : 0.6}
											rx={2}
										/>
										{cell.value > 0 && (
											<text
												x={x + CELL / 2}
												y={y + CELL / 2 + 0.5}
												textAnchor="middle"
												dominantBaseline="middle"
												fill={cell.value >= 2 ? "var(--surface)" : "var(--ink)"}
												fontSize={9}
												fontWeight={500}
												fontVariant="tabular-nums"
											>
												{cell.value}
											</text>
										)}
										{cell.subs?.map((v, si) => (
											<circle
												// biome-ignore lint/suspicious/noArrayIndexKey: at most two, positional
												key={si}
												cx={x + CELL - 3 - si * 4}
												cy={y + CELL - 3}
												r={1.6}
												fill={v > 0 ? "var(--ink)" : "none"}
												stroke="var(--ink)"
												strokeWidth={0.7}
											/>
										))}
										{cell.off && (
											<text
												x={x + CELL / 2}
												y={y - 1}
												textAnchor="middle"
												fill="var(--moiety-r)"
												fontSize={8}
											>
												*
											</text>
										)}
									</g>
								);
							})}
							{colSums && (
								<text
									x={x + CELL / 2}
									y={top + rows.length * step + 10}
									textAnchor="middle"
									fill="var(--ink-2)"
									fontSize={8.5}
									fontVariant="tabular-nums"
								>
									{col.cells.reduce<number>((a, c) => a + (c?.value ?? 0), 0)}
								</text>
							)}
						</g>
					);
				})}
				{colSums && (
					<text
						x={labelW - 8}
						y={top + rows.length * step + 10}
						textAnchor="end"
						fill="var(--ink-3)"
						fontSize={9}
					>
						Σ
					</text>
				)}
			</svg>
		</div>
	);
}

export interface ShareItem {
	label: string;
	sub?: string;
	share: number;
	mean: number;
	n: number;
}

/** Knotted share by position, with the mean value written over each bar. */
export function ShareBars({
	items,
	colour,
	title,
}: {
	items: ShareItem[];
	colour: string;
	title: string;
}) {
	const slot = 46;
	const barW = 26;
	const padL = 34;
	const padT = 22;
	const plotH = 120;
	const width = padL + items.length * slot + 10;
	const height = padT + plotH + 40;
	const yOf = (s: number) => padT + plotH - s * plotH;
	return (
		<div className="ctt-scroll">
			<svg
				width={width}
				height={height}
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label={title}
				style={{ display: "block", minWidth: width }}
			>
				<title>{title}</title>
				{[0, 0.5, 1].map((t) => (
					<g key={t}>
						<line
							x1={padL}
							x2={width - 6}
							y1={yOf(t)}
							y2={yOf(t)}
							stroke={t === 0 ? "var(--rule)" : "var(--hairline)"}
						/>
						<text
							x={padL - 5}
							y={yOf(t)}
							textAnchor="end"
							dominantBaseline="middle"
							fill="var(--ink-3)"
							fontSize={9}
						>
							{t * 100}%
						</text>
					</g>
				))}
				{items.map((it, i) => {
					const x = padL + i * slot + (slot - barW) / 2;
					return (
						<g key={it.label}>
							<title>{`${it.label}: knotted ${(100 * it.share).toFixed(0)}% of ${it.n} readable, mean ${it.mean.toFixed(2)}`}</title>
							<rect
								x={x}
								y={yOf(it.share)}
								width={barW}
								height={plotH * it.share}
								fill={colour}
								fillOpacity={0.85}
								rx={2}
							/>
							<text
								x={x + barW / 2}
								y={yOf(it.share) - 4}
								textAnchor="middle"
								fill="var(--ink-2)"
								fontSize={9}
								fontVariant="tabular-nums"
							>
								{it.mean.toFixed(2)}
							</text>
							<text
								x={x + barW / 2}
								y={padT + plotH + 13}
								textAnchor="middle"
								fill="var(--ink)"
								fontSize={10}
								fontVariant="tabular-nums"
							>
								{it.label}
							</text>
							{it.sub && (
								<text
									x={x + barW / 2}
									y={padT + plotH + 24}
									textAnchor="middle"
									fill="var(--ink-3)"
									fontSize={8.5}
								>
									{it.sub}
								</text>
							)}
						</g>
					);
				})}
				<text
					x={padL + (items.length * slot) / 2}
					y={height - 3}
					textAnchor="middle"
					fill="var(--ink-3)"
					fontSize={9}
				>
					knotted share by position; mean value above each bar
				</text>
			</svg>
		</div>
	);
}
