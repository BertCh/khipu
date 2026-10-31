import { scaleBand, scaleLinear } from "d3-scale";
import { useMemo, useState } from "react";
import { useMeasure } from "./useMeasure";

export interface Column {
	key: string;
	label: string;
	value: number;
	/** optional second series drawn as a marker (e.g. an expected value) */
	marker?: number;
}

interface Props {
	data: Column[];
	height?: number;
	/** label for the bar series and (if present) the marker series — shown in the legend and tooltip */
	series: string;
	markerSeries?: string;
	format?: (v: number) => string;
	/** show every nth x label (auto if omitted) */
	labelEvery?: number;
	/** y-axis unit hint, e.g. "cords" */
	unit?: string;
	/** which x labels to emphasise (e.g. the modal bin) */
	highlight?: string;
}

const fmt = (v: number) => v.toLocaleString();

/**
 * Columns from a single baseline with 2px surface gaps, 4px rounded caps,
 * hairline gridlines and a per-column hover tooltip. Optional marker series.
 */
export default function Columns({
	data,
	height = 220,
	series,
	markerSeries,
	format = fmt,
	labelEvery,
	unit,
	highlight,
}: Props) {
	const { ref, width } = useMeasure<HTMLDivElement>(560);
	const [hover, setHover] = useState<number | null>(null);

	const margin = { top: unit ? 26 : 12, right: 8, bottom: 26, left: 44 };
	const innerW = Math.max(80, width - margin.left - margin.right);
	const innerH = height - margin.top - margin.bottom;

	const x = useMemo(
		() =>
			scaleBand<string>()
				.domain(data.map((d) => d.key))
				.range([0, innerW])
				.paddingInner(0)
				.paddingOuter(0.05),
		[data, innerW],
	);
	const maxY = Math.max(
		1,
		...data.map((d) => Math.max(d.value, d.marker ?? 0)),
	);
	const y = useMemo(
		() => scaleLinear().domain([0, maxY]).nice(4).range([innerH, 0]),
		[maxY, innerH],
	);
	const ticks = y.ticks(4);
	const band = x.bandwidth();
	const barW = Math.max(1, Math.min(24, band - 2));
	const every =
		labelEvery ?? Math.max(1, Math.ceil((data.length * 34) / innerW));

	const hovered = hover != null ? data[hover] : null;

	return (
		<div ref={ref} className="columns" style={{ position: "relative" }}>
			<svg
				width={width}
				height={height}
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label={`${series} by ${data.length} bins`}
				onPointerLeave={() => setHover(null)}
			>
				<g transform={`translate(${margin.left},${margin.top})`}>
					{ticks.map((t) => (
						<g key={t} transform={`translate(0,${y(t)})`}>
							<line
								x1={0}
								x2={innerW}
								stroke="var(--hairline)"
								strokeWidth={1}
							/>
							<text
								x={-8}
								y={0}
								className="chart-tick"
								textAnchor="end"
								dominantBaseline="middle"
							>
								{compact(t)}
							</text>
						</g>
					))}
					{unit && (
						<text x={-margin.left + 2} y={-13} className="chart-tick">
							{unit}
						</text>
					)}

					{data.map((d, i) => {
						const bx = (x(d.key) ?? 0) + (band - barW) / 2;
						const by = y(d.value);
						const h = innerH - by;
						const r = Math.min(4, barW / 2, h);
						const lift = hover === i;
						return (
							<g key={d.key}>
								<path
									d={roundedTop(bx, by, barW, h, r, innerH)}
									fill="var(--series-1)"
									opacity={hover == null || lift ? 1 : 0.55}
									className={highlight === d.key ? "chart-bar-hl" : undefined}
								/>
								<rect
									x={x(d.key) ?? 0}
									y={0}
									width={band}
									height={innerH}
									fill="transparent"
									onPointerEnter={() => setHover(i)}
									onPointerMove={() => setHover(i)}
								/>
								{(i % every === 0 || highlight === d.key) && (
									<text
										x={bx + barW / 2}
										y={innerH + 16}
										className="chart-tick"
										textAnchor="middle"
									>
										{d.label}
									</text>
								)}
							</g>
						);
					})}

					{markerSeries &&
						data.map((d) =>
							d.marker == null ? null : (
								<circle
									key={`m-${d.key}`}
									cx={(x(d.key) ?? 0) + band / 2}
									cy={y(d.marker)}
									r={4}
									fill="var(--series-context)"
									stroke="var(--surface)"
									strokeWidth={2}
									pointerEvents="none"
								/>
							),
						)}

					<line
						x1={0}
						x2={innerW}
						y1={innerH}
						y2={innerH}
						stroke="var(--rule)"
						strokeWidth={1}
					/>
				</g>
			</svg>

			{markerSeries && (
				<div className="chart-legend">
					<span>
						<i
							className="legend-rect"
							style={{ background: "var(--series-1)" }}
						/>
						{series}
					</span>
					<span>
						<i
							className="legend-dot"
							style={{ background: "var(--series-context)" }}
						/>
						{markerSeries}
					</span>
				</div>
			)}

			{hovered && hover != null && (
				<div
					className="chart-tip"
					style={{
						left: Math.min(
							width - 150,
							margin.left + (x(hovered.key) ?? 0) + band / 2,
						),
						top:
							margin.top + y(Math.max(hovered.value, hovered.marker ?? 0)) - 8,
					}}
				>
					<div className="chart-tip-title">{hovered.label}</div>
					<div className="chart-tip-row">
						<i
							className="legend-rect"
							style={{ background: "var(--series-1)" }}
						/>
						<strong>{format(hovered.value)}</strong>
						<span>{series}</span>
					</div>
					{markerSeries && hovered.marker != null && (
						<div className="chart-tip-row">
							<i
								className="legend-dot"
								style={{ background: "var(--series-context)" }}
							/>
							<strong>{format(hovered.marker)}</strong>
							<span>{markerSeries}</span>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function roundedTop(
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
	baseline: number,
): string {
	if (h <= 0) return "";
	return [
		`M${x},${baseline}`,
		`V${y + r}`,
		`Q${x},${y} ${x + r},${y}`,
		`H${x + w - r}`,
		`Q${x + w},${y} ${x + w},${y + r}`,
		`V${baseline}`,
		"Z",
	].join(" ");
}

function compact(v: number): string {
	if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
	if (v >= 10_000) return `${Math.round(v / 1000)}K`;
	if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
	return String(v);
}
